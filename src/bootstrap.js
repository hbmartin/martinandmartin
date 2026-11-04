(() => {
  const start = performance.now();
  const root = document.documentElement;
  const urls = /*FONTS*/ {};
  const shapes = Object.keys(urls);
  const randomShape = () => shapes[Math.floor(Math.random() * shapes.length)];
  let shape = randomShape();
  /*SHAPE_OVERRIDE*/
  root.dataset.view = 'pending';
  const loaded = new Map();
  const load = (key) => {
    if (!loaded.has(key)) {
      const family = 'Geist Pixel ' + key;
      const url = 'url("' + urls[key] + '") format("woff2")';
      const promise = Promise.resolve().then(() => new FontFace(family, url).load()).then((face) => {
        document.fonts.add(face);
        return family;
      }, (error) => {
        loaded.delete(key);
        throw error;
      });
      loaded.set(key, promise);
    }
    return loaded.get(key);
  };
  const ready = new Promise((resolve) => {
    let settled = false;
    const finish = (family) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (family) root.style.setProperty('--type', '"' + family + '"');
      root.dataset.font = family ? 'selected' : 'system';
      resolve(family);
    };
    const timer = setTimeout(() => finish(null), Math.max(0, 2000 - (performance.now() - start)));
    load(shape).then((family) => finish(performance.now() - start < 2000 ? family : null), () => finish(null));
  });
  window.mmBoot = { start, shape, ready, load, randomShape };
  setTimeout(() => {
    if (root.dataset.view === 'pending') root.dataset.view = 'static';
  }, Math.max(0, 3000 - (performance.now() - start)));
})();
