Pod::Spec.new do |s|
  s.name           = 'ReadNestTts'
  s.version        = '1.0.0'
  s.summary        = 'ReadNest background TTS (AVSpeech with playback audio session).'
  s.authors        = 'abhirahtech'
  s.homepage       = 'https://readnest.app'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :path => '.' }
  s.swift_version  = '5.9'
  s.source_files   = '*.swift'
  s.dependency 'ExpoModulesCore'
end
