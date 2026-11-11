    // Standard 6 quality probe points for the Recompressor curve
    const PROBE_QUALITIES = [0.15, 0.35, 0.55, 0.75, 0.86, 0.95];

    /**
     * Extracts a reference RGBA pixel array at up to 320px width for fast, authentic RMSE & MAX ERROR calculation
     */
    function createReferencePixelGrid(img, w, h) {
      const maxDim = 300;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const gw = Math.max(1, Math.round(w * scale));
      const gh = Math.max(1, Math.round(h * scale));
      const c = document.createElement('canvas');
      c.width = gw;
      c.height = gh;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, gw, gh);
      ctx.drawImage(img, 0, 0, gw, gh);
      return {
        width: gw,
        height: gh,
        data: ctx.getImageData(0, 0, gw, gh).data
      };
    }

    /**
     * Computes true per-channel Root-Mean-Square Error (0-255) and Max Single-Channel Error (0-255)
     */
    async function computeRmseAndMaxError(blob, refGrid) {
      const url = URL.createObjectURL(blob);
      try {
        const compImg = await decodeHtmlImage(url);
        const c = document.createElement('canvas');
        c.width = refGrid.width;
        c.height = refGrid.height;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, refGrid.width, refGrid.height);
        ctx.drawImage(compImg, 0, 0, refGrid.width, refGrid.height);
        const compData = ctx.getImageData(0, 0, refGrid.width, refGrid.height).data;
        const origData = refGrid.data;

        let sumSq = 0;
        let maxErr = 0;
        const totalPixels = refGrid.width * refGrid.height;

        for (let i = 0; i < origData.length; i += 4) {
          const dr = Math.abs(origData[i] - compData[i]);
          const dg = Math.abs(origData[i + 1] - compData[i + 1]);
          const db = Math.abs(origData[i + 2] - compData[i + 2]);

          sumSq += dr * dr + dg * dg + db * db;
          if (dr > maxErr) maxErr = dr;
          if (dg > maxErr) maxErr = dg;
          if (db > maxErr) maxErr = db;
        }

        const rmse = Math.sqrt(sumSq / (totalPixels * 3));
        return {
          rmse: Number(rmse.toFixed(2)),
          maxError: maxErr
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    /**
     * Encodes an HTMLImageElement at given MIME, quality (0..1), and scale (0..1)
     * Supports JPG, WebP, and full-color PNG. PNG quality controls resolution,
     * since the browser's lossless PNG encoder ignores its quality argument.
     */
    async function encodeCandidate(img, mime, q, scale = 1.0) {
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      if (mime === 'image/png') {
        // Reduce pixel count, never RGB precision: channel quantization bands skin gradients.
        scale *= Math.sqrt(Math.min(1, q / 0.95));
      }
      const w = Math.max(1, Math.round(srcW * scale));
      const h = Math.max(1, Math.round(srcH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      if (mime === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);

      const blob = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Image encoding timed out')), 30000);
        try {
          canvas.toBlob(result => { clearTimeout(timeout); resolve(result); }, mime, q);
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      });
      if (!blob || blob.type !== mime) throw new Error('Image encoder unavailable: ' + mime);
      return {
        q,
        blob,
        size: blob.size,
        kb: blob.size / 1024,
        width: w,
        height: h,
        scale: Math.min(w / srcW, h / srcH)
      };
    }

    /**
     * Probes the 6 standard curve points, finds the Pareto Knee-of-the-Curve,
     * and if in 'target' mode, executes the 8-step binary search + Smart Auto-Scale.
     */
    async function probeAndSolveItem(item) {
      const points = [];
      for (const q of PROBE_QUALITIES) {
        const cand = await encodeCandidate(item.imgElement, item.outFormat, q, 1.0);
        const err = await computeRmseAndMaxError(cand.blob, item.refGrid);
        points.push({
          ...cand,
          rmse: err.rmse,
          maxError: err.maxError
        });
      }
      item.probePoints = points;

      // Find Pareto Knee Point (minimum normalized distance to origin [size=0, rmse=0])
      const maxKB = Math.max(...points.map(p => p.kb), 1);
      const maxRmse = Math.max(...points.map(p => p.rmse), 1);
      let bestKneeIdx = 3;
      let minScore = Infinity;

      points.forEach((pt, idx) => {
        // Weight size and visual error equally, penalize if larger than original file
        const normSize = pt.kb / maxKB;
        const normErr = (pt.rmse / maxRmse) * 1.15;
        const penalty = pt.size >= item.origSize ? 0.5 : 0;
        const score = Math.sqrt(normSize * normSize + normErr * normErr) + penalty;
        if (score < minScore) {
          minScore = score;
          bestKneeIdx = idx;
        }
      });
      item.kneeIndex = bestKneeIdx;

      if (item.mode === 'knee') {
        item.targetNode = null;
        await applyChosenCandidate(item, points[bestKneeIdx], bestKneeIdx);
      } else if (item.mode === 'target') {
        await solveExactTargetKB(item);
      } else if (item.mode === 'manual') {
        const manualCand = await encodeCandidate(item.imgElement, item.outFormat, item.activeQuality, 1.0);
        const err = await computeRmseAndMaxError(manualCand.blob, item.refGrid);
        item.targetNode = { ...manualCand, rmse: err.rmse, maxError: err.maxError, isManual: true };
        await applyChosenCandidate(item, item.targetNode, -1);
      }
    }

    /**
     * Upgrade #1 & #3: 8-Step Binary Search for Exact Target Size (KB) + Smart Resolution Auto-Scale Fallback
     */
    async function solveExactTargetKB(item) {
      const targetBytes = Math.round(item.targetKB * 1024);
      const pts = item.probePoints;

      // Case A: Even the highest probed quality (95%) is already under targetBytes
      if (pts[pts.length - 1].size <= targetBytes) {
        const topPt = pts[pts.length - 1];
        item.targetNode = { ...topPt, isTargetHit: true };
        await applyChosenCandidate(item, item.targetNode, pts.length - 1);
        return;
      }

      // Case B: Lowest probe fits -> search quality (resolution for full-color PNG).
      const minScale1Pt = pts[0];
      if (minScale1Pt.size <= targetBytes) {
        let low = 0.12;
        let high = 0.95;
        let bestCand = minScale1Pt;

        for (let step = 0; step < 8; step++) {
          const mid = Number(((low + high) / 2).toFixed(4));
          const attempt = await encodeCandidate(item.imgElement, item.outFormat, mid, 1.0);
          if (attempt.size <= targetBytes) {
            bestCand = attempt;
            // Early exit if within 97.5% - 99.9% of target
            if (attempt.size / targetBytes >= 0.975) break;
            low = mid;
          } else {
            high = mid;
          }
        }

        const err = await computeRmseAndMaxError(bestCand.blob, item.refGrid);
        item.targetNode = { ...bestCand, rmse: err.rmse, maxError: err.maxError, isTargetHit: true };
        await applyChosenCandidate(item, item.targetNode, -1);
        return;
      }

      // Case C: Upgrade #3 Smart Auto-Scale Fallback!
      // When a high-res image (or PNG) cannot fit under targetKB at 100% dimensions without severe artifacts,
      // binary-search resolution with full-color PNG or clean lossy quality (Q=0.74).
      let sLow = 0;
      let sHigh = 1;
      const fallbackQ = item.outFormat === 'image/png' ? 0.95 : 0.74;
      let bestScaled = await encodeCandidate(item.imgElement, item.outFormat, fallbackQ, sLow);

      for (let step = 0; step < 12; step++) {
        const sMid = (sLow + sHigh) / 2;
        const attempt = await encodeCandidate(item.imgElement, item.outFormat, fallbackQ, sMid);
        if (attempt.size <= targetBytes) {
          bestScaled = attempt;
          if (attempt.size / targetBytes >= 0.95) break;
          sLow = sMid;
        } else {
          sHigh = sMid;
        }
      }

      const err = await computeRmseAndMaxError(bestScaled.blob, item.refGrid);
      item.targetNode = { ...bestScaled, rmse: err.rmse, maxError: err.maxError, isTargetHit: bestScaled.size <= targetBytes };
      await applyChosenCandidate(item, item.targetNode, -1);
    }

    async function applyChosenCandidate(item, cand, pointIdx) {
      if (item.compUrl) URL.revokeObjectURL(item.compUrl);
      item.compBlob = cand.blob;
      item.compUrl = URL.createObjectURL(cand.blob);
      item.compSize = cand.size;
      item.outWidth = cand.width;
      item.outHeight = cand.height;
      item.activeQuality = cand.q;
      item.activeScale = cand.scale;
      item.activeRmse = cand.rmse;
      item.activeMaxError = cand.maxError;
      item.activePointIndex = pointIdx;
    }

    function decodeHtmlImage(url) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const timeout = setTimeout(() => {
          img.onload = img.onerror = null;
          img.src = '';
          reject(new Error('Image decoding timed out'));
        }, 30000);
        img.onload = () => { clearTimeout(timeout); resolve(img); };
        img.onerror = () => { clearTimeout(timeout); reject(new Error('Unable to decode image')); };
        img.src = url;
      });
    }

