import ExpoModulesCore
import AVFoundation
import MediaPlayer

private class SpeechDelegate: NSObject, AVSpeechSynthesizerDelegate {
  var onSentence: ((Int) -> Void)?
  var onDone: (() -> Void)?
  var currentIndex: Int = 0

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    onSentence?(currentIndex + 1) // advance signal consumed by module
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
    // Pause / jump / stop manage state explicitly; ignore cancels.
  }
}

public class ReadNestTtsModule: Module {
  private let synth = AVSpeechSynthesizer()
  private let delegate = SpeechDelegate()
  private var sentences: [String] = []
  private var index: Int = 0
  private var rate: Double = 1.0
  private var language: String = "en"
  private var title: String = "ReadNest"
  private var playing: Bool = false
  private var commandsRegistered = false

  public func definition() -> ModuleDefinition {
    Name("ReadNestTts")
    Events("onSentence", "onDone", "onStopped")

    OnCreate {
      self.synth.delegate = self.delegate
      self.delegate.onSentence = { [weak self] next in
        guard let self else { return }
        self.index = next
        if next >= self.sentences.count {
          self.finish(done: true)
        } else {
          self.sendEvent("onSentence", ["index": next])
          self.speakCurrent()
          self.updateNowPlaying()
        }
      }
    }

    Function("start") { (sentences: [String], fromIndex: Int, rate: Double, language: String, title: String) -> Bool in
      let clean = sentences.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
      guard !clean.isEmpty else { return false }
      self.sentences = Array(clean.prefix(20000))
      self.index = max(0, min(fromIndex, self.sentences.count - 1))
      self.rate = rate
      self.language = language
      self.title = title
      self.playing = true
      do {
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [])
        try AVAudioSession.sharedInstance().setActive(true)
      } catch {
        return false
      }
      self.registerCommands()
      self.sendEvent("onSentence", ["index": self.index])
      self.speakCurrent()
      self.updateNowPlaying()
      return true
    }

    Function("pause") {
      guard self.playing else { return }
      self.playing = false
      self.synth.pauseSpeaking(at: .word)
      self.updateNowPlaying()
    }

    Function("resume") {
      guard !self.playing, !self.sentences.isEmpty else { return }
      self.playing = true
      if self.synth.isPaused {
        self.synth.continueSpeaking()
      } else {
        self.speakCurrent()
      }
      self.updateNowPlaying()
    }

    Function("next") { self.jump(by: 3) }
    Function("prev") { self.jump(by: -3) }

    Function("stop") {
      self.synth.stopSpeaking(at: .immediate)
      self.finish(done: false)
    }

    Function("isPlaying") { self.playing }
  }

  private func speakCurrent() {
    guard index < sentences.count else { finish(done: true); return }
    delegate.currentIndex = index
    let u = AVSpeechUtterance(string: sentences[index])
    // App rate 0.4–2.0 → AVSpeech 0.2–1.0 (default 0.5).
    u.rate = Float(min(1.0, max(0.1, 0.5 * rate)))
    u.voice = AVSpeechSynthesisVoice(language: language) ?? AVSpeechSynthesisVoice(language: "en-US")
    synth.speak(u)
  }

  private func jump(by delta: Int) {
    guard !sentences.isEmpty else { return }
    synth.stopSpeaking(at: .immediate)
    index = max(0, min(sentences.count - 1, index + delta))
    sendEvent("onSentence", ["index": index])
    if playing { speakCurrent() }
    updateNowPlaying()
  }

  private func finish(done: Bool) {
    playing = false
    sendEvent(done ? "onDone" : "onStopped")
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func updateNowPlaying() {
    var info: [String: Any] = [
      MPMediaItemPropertyTitle: title,
      MPMediaItemPropertyArtist: "ReadNest",
    ]
    if !sentences.isEmpty {
      info[MPMediaItemPropertyPlaybackDuration] = Double(sentences.count)
      info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = Double(index)
      info[MPNowPlayingInfoPropertyPlaybackRate] = playing ? 1.0 : 0.0
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  private func registerCommands() {
    guard !commandsRegistered else { return }
    commandsRegistered = true
    let cc = MPRemoteCommandCenter.shared()
    cc.playCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      if !self.playing {
        self.playing = true
        if self.synth.isPaused { self.synth.continueSpeaking() } else { self.speakCurrent() }
        self.updateNowPlaying()
      }
      return .success
    }
    cc.pauseCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      if self.playing {
        self.playing = false
        self.synth.pauseSpeaking(at: .word)
        self.updateNowPlaying()
      }
      return .success
    }
    cc.nextTrackCommand.addTarget { [weak self] _ in self?.jump(by: 3); return .success }
    cc.previousTrackCommand.addTarget { [weak self] _ in self?.jump(by: -3); return .success }
  }
}
