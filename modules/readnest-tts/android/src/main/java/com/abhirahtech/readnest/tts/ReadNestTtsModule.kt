package com.abhirahtech.readnest.tts

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Expo module API for background narration (JS → service intents). */
class ReadNestTtsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReadNestTts")

    Events("onSentence", "onDone", "onStopped")

    OnCreate {
      TtsController.onEvent = { name, body -> sendEvent(name, body) }
    }

    OnDestroy {
      TtsController.onEvent = null
    }

    Function("start") { sentences: List<String>, fromIndex: Int, rate: Double, language: String, title: String ->
      val ctx = appContext.reactContext ?: return@Function false
      if (sentences.isEmpty()) return@Function false
      val intent = Intent(ctx, ReadNestTtsService::class.java).apply {
        action = ReadNestTtsService.ACTION_START
        putStringArrayListExtra(ReadNestTtsService.EXTRA_SENTENCES, ArrayList(sentences.take(20000)))
        putExtra(ReadNestTtsService.EXTRA_INDEX, fromIndex)
        putExtra(ReadNestTtsService.EXTRA_RATE, rate.toFloat())
        putExtra(ReadNestTtsService.EXTRA_LANGUAGE, language)
        putExtra(ReadNestTtsService.EXTRA_TITLE, title)
      }
      ContextCompat.startForegroundService(ctx, intent)
      true
    }

    Function("pause") {
      sendAction(ReadNestTtsService.ACTION_PAUSE)
    }

    Function("resume") {
      sendAction(ReadNestTtsService.ACTION_RESUME)
    }

    Function("next") {
      sendAction(ReadNestTtsService.ACTION_NEXT)
    }

    Function("prev") {
      sendAction(ReadNestTtsService.ACTION_PREV)
    }

    Function("stop") {
      sendAction(ReadNestTtsService.ACTION_STOP)
    }

    Function("isPlaying") {
      TtsController.isPlaying
    }
  }

  private fun sendAction(action: String) {
    val ctx = appContext.reactContext ?: return
    ctx.startService(Intent(ctx, ReadNestTtsService::class.java).setAction(action))
  }
}
