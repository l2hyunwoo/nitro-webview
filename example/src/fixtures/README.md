`media-test.mp4` is an original eight-second synthetic video with an audible 440 Hz tone and moving test pattern. It is a playback input, not validation footage. Generated with:

```sh
ffmpeg -f lavfi -i 'testsrc2=size=320x180:rate=24:duration=8' -f lavfi -i 'sine=frequency=440:sample_rate=44100:duration=8' -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -c:a aac -b:a 32k -movflags +faststart -shortest media-test.mp4
```

MediaVerificationScreen resolves the bundled asset through Metro in debug builds. Keep Metro reachable while testing. In release builds the asset is bundled locally.
