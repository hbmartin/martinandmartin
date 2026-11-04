(() => {
  const start = performance.now();
  const root = document.documentElement;
  const urls = /*FONTS*/ {};
  const family = 'Geist Pixel circle';
  root.dataset.view = 'pending';
  const loaded = Promise.resolve().then(() =>
    new FontFace(family, 'url("' + urls.circle + '") format("woff2")').load()
  ).then((face) => { document.fonts.add(face); return family; });
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
    loaded.then((family) => finish(performance.now() - start < 2000 ? family : null), () => finish(null));
  });
  window.mmBoot = { start, ready };
  setTimeout(() => {
    if (root.dataset.view === 'pending') root.dataset.view = 'static';
  }, Math.max(0, 3000 - (performance.now() - start)));
})();
