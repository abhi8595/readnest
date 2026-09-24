package com.abhirahtech.readnest.tts

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.core.app.NotificationCompat
import java.util.Locale

/**
 * Foreground service (mediaPlayback type) that narrates sentence-by-sentence
 * with the platform TextToSpeech engine, so read-aloud survives screen lock
 * and backgrounding. Sentence granularity matches the foreground player:
 * pause/resume/next/prev operate on sentence boundaries.
 */
class ReadNestTtsService : Service() {

  companion object {
    const val ACTION_START = "com.abhirahtech.readnest.tts.START"
    const val ACTION_PAUSE = "com.abhirahtech.readnest.tts.PAUSE"
    const val ACTION_RESUME = "com.abhirahtech.readnest.tts.RESUME"
    const val ACTION_NEXT = "com.abhirahtech.readnest.tts.NEXT"
    const val ACTION_PREV = "com.abhirahtech.readnest.tts.PREV"
    const val ACTION_STOP = "com.abhirahtech.readnest.tts.STOP"

    const val EXTRA_SENTENCES = "sentences"
    const val EXTRA_INDEX = "fromIndex"
    const val EXTRA_RATE = "rate"
    const val EXTRA_LANGUAGE = "language"
    const val EXTRA_TITLE = "title"

    private const val CHANNEL_ID = "readnest_tts"
    private const val NOTIF_ID = 4101
  }

  private var tts: TextToSpeech? = null
  private var ttsReady = false
  private var finishing = false

  override fun onCreate() {
    super.onCreate()
    TtsController.service = this
    createChannel()
    tts = TextToSpeech(this) { status ->
      ttsReady = status == TextToSpeech.SUCCESS
      if (ttsReady) {
        tts?.setOnUtteranceProgressListener(progressListener)
        applyVoice()
        // If START arrived before engine init, begin now.
        if (TtsController.isPlaying) speakFrom(TtsController.index)
      }
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        finishing = false
        TtsController.sentences = intent.getStringArrayListExtra(EXTRA_SENTENCES) ?: emptyList()
        TtsController.index = intent.getIntExtra(EXTRA_INDEX, 0)
        TtsController.rate = intent.getFloatExtra(EXTRA_RATE, 1f)
        TtsController.language = intent.getStringExtra(EXTRA_LANGUAGE) ?: "en"
        TtsController.title = intent.getStringExtra(EXTRA_TITLE) ?: "ReadNest"
        TtsController.markPlaying(true)
        goForeground()
        if (ttsReady) {
          applyVoice()
          speakFrom(TtsController.index)
        }
      }
      ACTION_PAUSE -> pause()
      ACTION_RESUME -> resume()
      ACTION_NEXT -> jump(3)
      ACTION_PREV -> jump(-3)
      ACTION_STOP -> stopAll(emitStopped = true)
    }
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    tts?.shutdown()
    tts = null
    TtsController.service = null
    super.onDestroy()
  }

  // ── Playback ──────────────────────────────────────────

  private val progressListener = object : UtteranceProgressListener() {
    override fun onStart(utteranceId: String?) {
      val i = utteranceId?.toIntOrNull() ?: return
      TtsController.index = i
      TtsController.emit("onSentence", mapOf("index" to i))
      updateNotification()
    }

    override fun onDone(utteranceId: String?) {
      val i = utteranceId?.toIntOrNull() ?: return
      val total = TtsController.sentences.size
      if (i >= total - 1 || total == 0) {
        TtsController.markPlaying(false)
        TtsController.emit("onDone")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
      }
    }

    @Deprecated("Deprecated in Java")
    override fun onError(utteranceId: String?) {
      // Skip poison sentences instead of stalling the queue.
      val i = (utteranceId?.toIntOrNull() ?: TtsController.index) + 1
      if (TtsController.isPlaying && i < TtsController.sentences.size) speakFrom(i)
      else onDone(utteranceId)
    }
  }

  private fun applyVoice() {
    val engine = tts ?: return
    try {
      val locale = Locale.forLanguageTag(TtsController.language)
      val res = engine.setLanguage(if (locale.language.isEmpty()) Locale.ENGLISH else locale)
      if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
        engine.language = Locale.ENGLISH
      }
    } catch (_: Exception) {
      engine.language = Locale.ENGLISH
    }
    engine.setSpeechRate(TtsController.rate.coerceIn(0.4f, 2f))
  }

  private fun speakFrom(i: Int) {
    val list = TtsController.sentences
    if (list.isEmpty()) {
      stopAll(emitStopped = true)
      return
    }
    val start = i.coerceIn(0, list.size - 1)
    TtsController.index = start
    TtsController.markPlaying(true)
    tts?.stop()
    for (k in start until list.size) {
      val text = list[k]
      if (text.isBlank()) continue
      tts?.speak(text, TextToSpeech.QUEUE_ADD, Bundle(), k.toString())
    }
    updateNotification()
  }

  private fun pause() {
    if (!TtsController.isPlaying) return
    tts?.stop() // sentence granularity: resume re-speaks current sentence
    TtsController.markPlaying(false)
    updateNotification()
  }

  private fun resume() {
    if (TtsController.isPlaying || TtsController.sentences.isEmpty()) return
    speakFrom(TtsController.index)
  }

  private fun jump(delta: Int) {
    if (TtsController.sentences.isEmpty()) return
    // stop() silences the queue without firing onDone; re-queue from target.
    val target = (TtsController.index + delta).coerceIn(0, TtsController.sentences.size - 1)
    if (TtsController.isPlaying) speakFrom(target)
    else {
      TtsController.index = target
      TtsController.emit("onSentence", mapOf("index" to target))
      updateNotification()
    }
  }

  private fun stopAll(emitStopped: Boolean) {
    finishing = true
    tts?.stop()
    TtsController.markPlaying(false)
    if (emitStopped) TtsController.emit("onStopped")
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  // ── Notification ──────────────────────────────────────

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < 26) return
    val mgr = getSystemService(NotificationManager::class.java) ?: return
    mgr.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Read-aloud", NotificationManager.IMPORTANCE_LOW)
    )
  }

  private fun actionIntent(action: String, reqCode: Int): PendingIntent {
    val intent = Intent(this, ReadNestTtsService::class.java).setAction(action)
    return PendingIntent.getService(
      this, reqCode, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun buildNotification(): Notification {
    val playing = TtsController.isPlaying
    val total = TtsController.sentences.size
    val idx = TtsController.index.coerceIn(0, maxOf(0, total - 1))
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(TtsController.title)
      .setContentText(if (total > 0) "Sentence ${idx + 1} of $total" else "Read-aloud")
      .setSmallIcon(if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play)
      .setOngoing(playing)
      .setOnlyAlertOnce(true)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .addAction(
        android.R.drawable.ic_media_previous, "Back",
        actionIntent(ACTION_PREV, 11)
      )
      .addAction(
        if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
        if (playing) "Pause" else "Play",
        actionIntent(if (playing) ACTION_PAUSE else ACTION_RESUME, 12)
      )
      .addAction(
        android.R.drawable.ic_media_next, "Next",
        actionIntent(ACTION_NEXT, 13)
      )
      .addAction(
        android.R.drawable.ic_menu_close_clear_cancel, "Stop",
        actionIntent(ACTION_STOP, 14)
      )
    // Tap the notification → reopen the app.
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    if (launch != null) {
      builder.setContentIntent(
        PendingIntent.getActivity(
          this, 10, launch,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
      )
    }
    return builder.build()
  }

  private fun goForeground() {
    val notif = buildNotification()
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIF_ID, notif)
    }
  }

  private fun updateNotification() {
    if (finishing) return
    try {
      val mgr = getSystemService(NotificationManager::class.java) ?: return
      mgr.notify(NOTIF_ID, buildNotification())
    } catch (_: Exception) { /* channel torn down */ }
  }
}
