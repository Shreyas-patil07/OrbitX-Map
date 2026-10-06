// Background video with overlay and grid — fixed behind all content.
// aria-hidden keeps it decorative/invisible to screen readers.
function BackgroundVideo() {
  return (
    <div className="bg-video-wrap" aria-hidden="true">
      <video
        className="bg-video art"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        src="/bg_video.mp4"
      />
      <div className="bg-video-overlay" />
      <div className="bg-video-grid" />
    </div>
  );
}

export default BackgroundVideo;
