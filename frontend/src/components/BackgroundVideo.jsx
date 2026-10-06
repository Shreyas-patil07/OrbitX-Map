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
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_104303_0c6d60b2-9353-408e-9449-585108a22fb5.mp4"
      />
      <div className="bg-video-overlay" />
      <div className="bg-video-grid" />
    </div>
  );
}

export default BackgroundVideo;
