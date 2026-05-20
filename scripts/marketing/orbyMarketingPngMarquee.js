/**
 * PNG marquee — pause CSS loop off-screen; decode images when near viewport.
 */
const IO_OPTIONS = { root: null, rootMargin: '320px 0px', threshold: 0.01 };

/**
 * @param {HTMLImageElement} img
 */
function decodeMarqueeImage(img) {
  if (!img.src || img.dataset.orbyMarqueeDecoded === '1') return;
  if (typeof img.decode === 'function') {
    img
      .decode()
      .then(() => {
        img.dataset.orbyMarqueeDecoded = '1';
      })
      .catch(() => {
        img.dataset.orbyMarqueeDecoded = '1';
      });
    return;
  }
  img.dataset.orbyMarqueeDecoded = '1';
}

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function initPngMarqueePerformance(root) {
  const block = root?.querySelector('[data-orby-marketing-png-marquee]');
  const track = block?.querySelector('.orby-marketing__png-marquee-track');
  if (!block || !track) return () => {};

  const imgs = [
    ...block.querySelectorAll('.orby-marketing__png-marquee-img'),
  ];

  const setPlaying = (playing) => {
    block.classList.toggle('orby-marketing__png-marquee--playing', playing);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.target !== block) return;
      if (entry.isIntersecting) {
        imgs.forEach(decodeMarqueeImage);
        setPlaying(true);
      } else {
        setPlaying(false);
      }
    });
  }, IO_OPTIONS);

  observer.observe(block);

  return () => {
    observer.disconnect();
    setPlaying(false);
  };
}
