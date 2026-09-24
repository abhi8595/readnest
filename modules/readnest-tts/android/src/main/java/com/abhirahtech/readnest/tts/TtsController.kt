package com.abhirahtech.readnest.tts

/**
 * Same-process bridge between the Expo module API (JS thread) and the
 * foreground [ReadNestTtsService]. The service owns the TextToSpeech
 * engine; the module only sends intents and receives events.
 */
object TtsController {
  @Volatile var sentences: List<String> = emptyList()
  @Volatile var index: Int = 0
  @Volatile var rate: Float = 1f
  @Volatile var language: String = "en"
  @Volatile var title: String = "ReadNest"

  @Volatile var isPlaying: Boolean = false
    private set

  /** Set by the module; forwards native events to JS. */
  var onEvent: ((name: String, body: Map<String, Any?>) -> Unit)? = null

  internal var service: ReadNestTtsService? = null

  fun emit(name: String, body: Map<String, Any?> = emptyMap()) {
    onEvent?.invoke(name, body)
  }

  fun markPlaying(value: Boolean) {
    isPlaying = value
  }
}
