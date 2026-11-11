const sampleScriptLoads = new Map();

function loadSampleScriptOnce(src) {
  if (sampleScriptLoads.has(src)) return sampleScriptLoads.get(src);
  const load = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.dataset.sample = src;
    const fail = () => {
      clearTimeout(timeout);
      s.remove();
      sampleScriptLoads.delete(src);
      reject(new Error('Unable to load sample: ' + src));
    };
    const timeout = setTimeout(fail, 30000);
    s.onload = () => { clearTimeout(timeout); resolve(); };
    s.onerror = fail;
    document.head.appendChild(s);
  });
  sampleScriptLoads.set(src, load);
  return load;
}

async function buildProceduralSampleFile(kind) {
  if (kind === 'landscape') {
    if (typeof LANDSCAPE_SAMPLE_BASE64 === 'undefined') {
      await loadSampleScriptOnce('js/landscape-sample.js');
    }
    const bytes = Uint8Array.from(atob(LANDSCAPE_SAMPLE_BASE64), (c) => c.charCodeAt(0));
    return new File([bytes], 'The Solitary Traveler.jpg', { type: 'image/jpeg' });
  }

  if (kind === 'portrait') {
    if (typeof PORTRAIT_SAMPLE_BASE64 === 'undefined') {
      await loadSampleScriptOnce('js/portrait-sample.js');
    }
    const bytes = Uint8Array.from(atob(PORTRAIT_SAMPLE_BASE64), (c) => c.charCodeAt(0));
    return new File([bytes], 'Portrait.png', { type: 'image/png' });
  }

  throw new Error('Unknown sample kind: ' + kind);
}
