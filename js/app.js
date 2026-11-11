
    // ============================================================================
    // 2. GLOBAL APPLICATION STATE
    // ============================================================================
    const state = {
      lang: 'en',
      items: [], // Array of ImageCardItem objects
      // Lightbox Inspector state
      lightbox: {
        isOpen: false,
        itemIndex: 0,
        viewMode: 'split', // 'orig' | 'diff' | 'comp' | 'split'
        splitPct: 50,
        zoom: 'fit',       // 'fit' | 1 | number
        scale: 1,
        panX: 0,
        panY: 0,
        isDraggingSplit: false,
        isPanning: false,
        panStartX: 0,
        panStartY: 0
      }
    };

    // ============================================================================
    // 3. INITIALIZATION & GLOBAL EVENT LISTENERS
    // ============================================================================
    window.addEventListener('DOMContentLoaded', async function () {
      bindGlobalEvents();
      setLanguage(state.lang);
      // Boot with 2 realistic procedural high-res images so the workspace is immediately alive
      await addSampleSpecimens(['landscape', 'portrait'], true);
    });

    function bindGlobalEvents() {
      // File Picker
      const fileInput = document.getElementById('fileInput');
      fileInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files.length > 0) {
          await ingestFileList(Array.from(e.target.files), false);
          fileInput.value = '';
        }
      });

      // Global Drag & Drop
      const dropzone = document.getElementById('heroDropzone');
      window.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('border-sky-300', 'ring-4', 'ring-sky-500/20');
      });
      window.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null) {
          dropzone.classList.remove('border-sky-300', 'ring-4', 'ring-sky-500/20');
        }
      });
      window.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-sky-300', 'ring-4', 'ring-sky-500/20');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          await ingestFileList(Array.from(e.dataTransfer.files), false);
        }
      });

      // Global Clipboard Paste (CTRL + V)
      window.addEventListener('paste', async (e) => {
        if (!e.clipboardData || !e.clipboardData.items) return;
        const files = [];
        for (const item of e.clipboardData.items) {
          if (item.type.startsWith('image/')) {
            const f = item.getAsFile();
            if (f) files.push(f);
          }
        }
        if (files.length > 0) {
          showToast('toastPasted', { count: files.length });
          await ingestFileList(files, false);
        }
      });

      // Lightbox interactions
      const lbViewport = document.getElementById('lightboxViewport');
      const lbDivider = document.getElementById('lbSplitDivider');

      lbDivider.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        state.lightbox.isDraggingSplit = true;
      });
      lbDivider.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        state.lightbox.isDraggingSplit = true;
      }, { passive: true });

      lbViewport.addEventListener('mousedown', (e) => {
        if (e.target.closest('#lbSplitDivider')) return;
        state.lightbox.isPanning = true;
        state.lightbox.panStartX = e.clientX - state.lightbox.panX;
        state.lightbox.panStartY = e.clientY - state.lightbox.panY;
      });
      lbViewport.addEventListener('touchstart', (e) => {
        if (e.target.closest('#lbSplitDivider')) return;
        if (e.touches.length === 1) {
          state.lightbox.isPanning = true;
          state.lightbox.panStartX = e.touches[0].clientX - state.lightbox.panX;
          state.lightbox.panStartY = e.touches[0].clientY - state.lightbox.panY;
        }
      }, { passive: true });

      window.addEventListener('mousemove', (e) => {
        if (!state.lightbox.isOpen) return;
        if (state.lightbox.isDraggingSplit) {
          updateLightboxSplitPos(e.clientX);
        } else if (state.lightbox.isPanning) {
          state.lightbox.panX = e.clientX - state.lightbox.panStartX;
          state.lightbox.panY = e.clientY - state.lightbox.panStartY;
          applyLightboxTransform();
        }
      });

      window.addEventListener('touchmove', (e) => {
        if (!state.lightbox.isOpen) return;
        if (state.lightbox.isDraggingSplit && e.touches.length > 0) {
          updateLightboxSplitPos(e.touches[0].clientX);
        } else if (state.lightbox.isPanning && e.touches.length === 1) {
          state.lightbox.panX = e.touches[0].clientX - state.lightbox.panStartX;
          state.lightbox.panY = e.touches[0].clientY - state.lightbox.panStartY;
          applyLightboxTransform();
        }
      }, { passive: true });

      window.addEventListener('mouseup', () => {
        state.lightbox.isDraggingSplit = false;
        state.lightbox.isPanning = false;
      });
      window.addEventListener('touchend', () => {
        state.lightbox.isDraggingSplit = false;
        state.lightbox.isPanning = false;
      });

      lbViewport.addEventListener('wheel', (e) => {
        if (!state.lightbox.isOpen) return;
        e.preventDefault();
        zoomLightboxBy(e.deltaY < 0 ? 1.15 : 0.87);
      }, { passive: false });

      // Keyboard shortcuts for Lightbox
      window.addEventListener('keydown', (e) => {
        if (!state.lightbox.isOpen) return;
        if (e.key === 'Tab') {
          const controls = [...document.querySelectorAll('#lightboxModal button')].filter(button => button.getClientRects().length);
          const first = controls[0], last = controls[controls.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowLeft') stepLightboxQuality(-1);
        else if (e.key === 'ArrowRight') stepLightboxQuality(1);
      });
    }

    // ============================================================================
    // 4. PROCEDURAL HIGH-DETAIL SAMPLE SPECIMEN GENERATOR (UPGRADE #7)
    // ============================================================================
    async function addSampleSpecimens(kinds = ['landscape'], clearExisting = false) {
      const generatedFiles = [];
      try {
        for (const kind of kinds) {
          const file = await buildProceduralSampleFile(kind);
          generatedFiles.push({ file, defaultTargetKB: kind === 'portrait' ? 150 : null });
        }

        if (clearExisting) {
          closeLightbox();
          state.items.forEach(revokeItemUrls);
          state.items = [];
        }

        for (const entry of generatedFiles) {
          await createAndProbeImageItem(entry.file, entry.defaultTargetKB, true);
        }

        renderWorkspace();
        showToast('toastSamples', { count: generatedFiles.length });
      } catch (error) {
        console.error('Failed to load samples:', error);
        renderWorkspace();
        showToast('sampleLoadFailed');
      }
    }

    // ============================================================================
    // 5. FILE INGESTION, MULTI-POINT RMSE PROBING & BINARY SEARCH ENGINE
    // ============================================================================
    async function ingestFileList(files, replaceExisting = false) {
      const validFiles = files.filter((f) =>
        ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name)
      );

      if (validFiles.length === 0) {
        showToast('invalidFiles');
        return;
      }

      // If only initial demo samples are present and user uploads real files, replace demo samples automatically
      if (replaceExisting || (state.items.length > 0 && state.items.every(it => it.isSample))) {
        closeLightbox();
        state.items.forEach(revokeItemUrls);
        state.items = [];
      }

      let processed = 0;
      let failed = files.length - validFiles.length;
      for (const file of validFiles) {
        try {
          await createAndProbeImageItem(file, null, false);
          processed++;
          renderWorkspace();
        } catch (error) {
          failed++;
          console.warn('Unable to process image:', file.name, error);
        }
      }

      renderWorkspace();
      showToast(failed ? 'processingPartial' : 'toastProcessed', { count: processed, failed });
    }

    async function createAndProbeImageItem(file, initialTargetKB = null, isSample = false) {
      if (file.size > 50 * 1024 * 1024) throw new Error('Image exceeds 50 MiB');
      const origUrl = URL.createObjectURL(file);
      try {
        const img = await decodeHtmlImage(origUrl);
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        if (width * height > 32000000) throw new Error('Image exceeds 32 megapixels');
        const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
          ? file.type
          : /\.png$/i.test(file.name) ? 'image/png' : /\.webp$/i.test(file.name) ? 'image/webp' : 'image/jpeg';

        // Compare a reference grid with its longest edge capped at 300 pixels.
        const refGrid = createReferencePixelGrid(img, width, height);

        const item = {
          id: 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          name: file.name,
          isSample,
          origFile: file,
          origUrl,
          imgElement: img,
          origFormat: mime,
          origSize: file.size,
          width,
          height,
          refGrid,
          // Configurable settings per card
          outFormat: mime,
          mode: initialTargetKB ? 'target' : 'knee', // 'knee' | 'target' | 'manual'
          targetKB: initialTargetKB || Math.max(30, Math.round((file.size / 1024) * 0.45)),
          // Probed curve points: Array of { q, blob, size, kb, width, height, scale, rmse, maxError }
          probePoints: [],
          kneeIndex: 3,
          activePointIndex: 3,
          // Active output state
          compBlob: null,
          compUrl: null,
          compSize: 0,
          outWidth: width,
          outHeight: height,
          activeQuality: 0.75,
          activeScale: 1.0,
          activeRmse: 0,
          activeMaxError: 0,
          targetNode: null // Populated when mode === 'target'
        };

        await probeAndSolveItem(item);
        state.items.push(item);
      } catch (error) {
        URL.revokeObjectURL(origUrl);
        throw error;
      }
    }

    function revokeItemUrls(item) {
      if (item.origUrl) URL.revokeObjectURL(item.origUrl);
      if (item.compUrl) URL.revokeObjectURL(item.compUrl);
    }

    // ============================================================================
    // 6. WORKSPACE RENDERING: SUMMARY BAR & 3-COLUMN RECOMPRESSOR CARDS
    // ============================================================================
    function renderWorkspace() {
      updateSummaryTelemetry();

      const container = document.getElementById('imageCardsContainer');
      const emptyBox = document.getElementById('emptyWorkspaceBox');

      if (state.items.length === 0) {
        container.innerHTML = '';
        emptyBox.classList.remove('hidden');
        return;
      }

      emptyBox.classList.add('hidden');
      container.innerHTML = state.items.map((item, idx) => buildImageCardHTML(item, idx)).join('');
    }

    function updateSummaryTelemetry() {
      const count = state.items.length;
      const totalOrig = state.items.reduce((acc, it) => acc + it.origSize, 0);
      const totalComp = state.items.reduce((acc, it) => acc + (it.compSize || 0), 0);
      const reductionPct = totalOrig > 0 ? ((1 - totalComp / totalOrig) * 100) : 0;

      document.getElementById('sumCount').textContent = String(count);
      document.getElementById('sumOrigSize').textContent = formatBytes(totalOrig);
      document.getElementById('sumCompSize').textContent = formatBytes(totalComp);
      document.getElementById('sumReduction').textContent = `${reductionPct >= 0 ? '-' : '+'}${Math.abs(reductionPct).toFixed(1)}%`;
    }

    /**
     * Builds the 3-Column Horizontal Card for an Image Item (100% Recompressor Layout + All Upgrades)
     */
    function buildImageCardHTML(item, index) {
      const origKB = item.origSize / 1024;
      const compKB = item.compSize / 1024;
      const savedPct = ((1 - item.compSize / item.origSize) * 100);
      const savedFormatted = `${savedPct >= 0 ? '-' : '+'}${Math.abs(savedPct).toFixed(1)}%`;
      const qPct = Math.round(item.activeQuality * 100);

      // Upgrade #5: Semantic Quality Badge based on authentic RMSE
      const semBadge = getSemanticQualityBadge(item.activeRmse);

      // Upgrade #3: Resolution & Auto-Scale status
      const isScaled = item.activeScale < 0.99;
      const scaleText = isScaled
        ? `<span class="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">${t('smartScaled')} ${Math.round(item.activeScale * 100)}% (${item.outWidth}×${item.outHeight})</span>`
        : `<span class="text-slate-500">${item.outWidth} × ${item.outHeight} ${t('pixelUnit')} (100%)</span>`;

      // Target hit status pill
      let targetStatusHTML = '';
      if (item.mode === 'target') {
        const hit = item.compSize <= Math.round(item.targetKB * 1024);
        targetStatusHTML = hit
          ? `<span class="px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-mono font-bold text-[10px]"><i class="fa-solid fa-bullseye mr-1"></i>${t('targetLocked', { kb: item.targetKB })}</span>`
          : `<span class="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-mono font-bold text-[10px]">${t('targetClosest', { kb: item.targetKB })}</span>`;
      } else if (item.mode === 'knee') {
        targetStatusHTML = `<span class="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono font-bold text-[10px]"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>${t('paretoKnee')}</span>`;
      } else {
        targetStatusHTML = `<span class="px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 font-mono font-bold text-[10px]">${t(item.outFormat === 'image/png' ? 'manualPngSize' : 'manualQuality', { q: qPct })}</span>`;
      }

      return `
        <article class="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div class="grid grid-cols-1 lg:grid-cols-12">

            <!-- COLUMN 1: THUMBNAIL & LIGHTBOX TRIGGER (3 COLS) -->
            <div class="lg:col-span-3 p-4 bg-slate-50/70 border-b lg:border-b-0 lg:border-r border-slate-200/80 flex flex-col justify-between gap-3 relative">
              <!-- Remove Item Button -->
              <button onclick="removeImageItem(${index})" title="${t('removeImage')}"
                class="absolute top-3 right-3 z-10 w-7 h-7 rounded-lg bg-white/90 hover:bg-rose-600 text-slate-500 hover:text-white border border-slate-200 shadow-sm flex items-center justify-center transition">
                <i class="fa-solid fa-xmark text-xs"></i>
              </button>

              <!-- File Header -->
              <div class="pr-8">
                <div class="flex items-center gap-1.5">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-800 text-white">${shortFormatLabel(item.origFormat)}</span>
                  <h3 class="font-bold text-xs text-slate-900 truncate" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</h3>
                </div>
                <div class="text-[11px] font-mono text-slate-400 mt-0.5">
                  ${item.width} × ${item.height} • ${formatSizeKB(origKB)}
                </div>
              </div>

              <!-- Clickable Thumbnail Container -->
              <div role="button" tabindex="0" aria-label="${t('inspectPixels')}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" onclick="openLightbox(${index}, 'split')"
                class="group relative rounded-xl overflow-hidden border border-slate-200 bg-checkerboard h-40 flex items-center justify-center cursor-pointer shadow-inner">
                <img src="${item.compUrl}" alt="${escapeHTML(item.name)}" class="max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-105" />
                <div class="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white p-2 text-center">
                  <div class="w-9 h-9 rounded-full bg-sky-500 flex items-center justify-center mb-1.5 shadow-lg">
                    <i class="fa-solid fa-magnifying-glass-plus text-sm"></i>
                  </div>
                  <span class="text-[11px] font-bold recomp-label">${t('inspectPixels')}</span>
                  <span class="text-[10px] text-sky-200 mt-0.5">${t('inspectModes')}</span>
                </div>
              </div>

              <!-- Quick Lightbox Mode Buttons -->
              <div class="grid grid-cols-2 gap-1.5 text-[11px]">
                <button onclick="openLightbox(${index}, 'diff')"
                  class="py-1.5 px-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold transition flex items-center justify-center gap-1">
                  <i class="fa-solid fa-fire-flame-curved text-amber-500"></i>
                  <span>${t('pixelDiff')}</span>
                </button>
                <button onclick="openLightbox(${index}, 'split')"
                  class="py-1.5 px-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold transition flex items-center justify-center gap-1">
                  <i class="fa-solid fa-arrows-left-right text-sky-600"></i>
                  <span>${t('splitView')}</span>
                </button>
              </div>
            </div>

            <!-- COLUMN 2: INTERACTIVE FILE SIZE vs. QUALITY (RMSE) CURVE & TARGET CONTROLS (5 COLS) -->
            <div class="lg:col-span-5 p-4 sm:p-5 border-b lg:border-b-0 lg:border-r border-slate-200/80 flex flex-col justify-between space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-extrabold recomp-label text-slate-700">${t('chartTitle')}</span>
                </div>
                ${targetStatusHTML}
              </div>

              <!-- Interactive SVG Curve Chart -->
              <div class="bg-slate-50/90 rounded-xl border border-slate-200/90 p-2.5 relative">
                ${buildCardSvgChart(item, index)}
              </div>

              <!-- Controls Below Curve: Target KB Input + Quick Chips + Format Switcher + Quality Slider -->
              <div class="space-y-2.5 pt-1">
                <!-- Target KB Row -->
                <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/70">
                  <div class="flex items-center gap-1.5">
                    <button onclick="setCardKneeMode(${index})"
                      class="px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                        item.mode === 'knee'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }">
                      ${t('autoKnee')}
                    </button>
                    <span class="text-slate-300">|</span>
                    <span class="text-[11px] font-bold text-slate-700">${t('exactKb')}</span>
                  </div>

                  <div class="flex items-center gap-1">
                    <button onclick="setCardTargetKB(${index}, 50)" class="px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold border ${item.mode === 'target' && item.targetKB === 50 ? 'border-rose-600 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600'}">50K</button>
                    <button onclick="setCardTargetKB(${index}, 100)" class="px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold border ${item.mode === 'target' && item.targetKB === 100 ? 'border-rose-600 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600'}">100K</button>
                    <button onclick="setCardTargetKB(${index}, 200)" class="px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold border ${item.mode === 'target' && item.targetKB === 200 ? 'border-rose-600 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600'}">200K</button>

                    <div class="relative ml-1">
                      <input id="cardTargetInput_${index}" aria-label="${t('exactKb')}" type="number" min="10" max="10240" step="10" value="${item.targetKB}"
                         onkeydown="if(event.key==='Enter') applyCardCustomTarget(${index})"
                        class="w-20 h-7 pl-2 pr-6 rounded-lg bg-white border border-slate-300 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-rose-500 tabular-nums" />
                      <span class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">KB</span>
                    </div>
                    <button onclick="applyCardCustomTarget(${index})"
                      class="h-7 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] transition">
                      ${t('lock')}
                    </button>
                  </div>
                </div>

                <!-- Format Switcher (Upgrade #2) & Manual Quality Slider -->
                <div class="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div class="flex items-center gap-1">
                    <span class="text-[11px] font-semibold text-slate-500 mr-1">${t('format')}</span>
                    ${['image/jpeg', 'image/webp', 'image/png'].map(fmt => `
                      <button onclick="setCardFormat(${index}, '${fmt}')"
                        class="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border transition ${
                          item.outFormat === fmt
                            ? 'bg-sky-600 text-white border-sky-600'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }">
                        ${shortFormatLabel(fmt)}
                      </button>
                    `).join('')}
                  </div>

                  <div class="flex items-center gap-2 flex-1 min-w-[150px]">
                    <span class="text-[11px] font-mono text-slate-500 shrink-0">${t(item.outFormat === 'image/png' ? 'pngSizeShort' : 'qualityShort')} <strong id="qLabel_${index}" class="text-sky-700">${qPct}%</strong></span>
                    <input aria-label="${t(item.outFormat === 'image/png' ? 'pngSizeShort' : 'qualityShort')}" type="range" min="10" max="98" step="1" value="${qPct}"
                      oninput="document.getElementById('qLabel_${index}').textContent = this.value + '%'"
                      onchange="setCardManualQuality(${index}, this.value)"
                      class="w-full" />
                  </div>
                </div>
              </div>
            </div>

            <!-- COLUMN 3: TELEMETRY, RMSE METRICS & DOWNLOAD (4 COLS) -->
            <div class="lg:col-span-4 p-4 sm:p-5 flex flex-col justify-between space-y-4 tabular-nums">

              <!-- Size Comparison Box -->
              <div class="space-y-3">
                <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <div class="text-[10px] font-bold recomp-label text-slate-400">${t('original')}</div>
                    <div class="text-sm font-mono font-bold text-slate-700">${formatSizeKB(origKB)}</div>
                  </div>

                  <div class="text-slate-300">
                    <i class="fa-solid fa-arrow-right"></i>
                  </div>

                  <div class="text-right">
                    <div class="text-[10px] font-bold recomp-label text-sky-600">${t('compressed')} (${shortFormatLabel(item.outFormat)})</div>
                    <div class="text-lg font-mono font-extrabold text-slate-900">${formatSizeKB(compKB)}</div>
                  </div>

                  <div class="px-2.5 py-1.5 rounded-xl ${savedPct >= 0 ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-amber-50 border border-amber-200 text-amber-700'} font-mono font-extrabold text-sm">
                    ${savedFormatted}
                  </div>
                </div>

                <!-- Authentic RMSE & MAX ERROR Telemetry + Semantic Badge (Upgrade #5) -->
                <div class="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] font-bold text-slate-600">${t('pixelTelemetry')}</span>
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${semBadge.classes}">
                      ${semBadge.label}
                    </span>
                  </div>

                  <div class="grid grid-cols-2 gap-2 pt-1">
                    <div class="bg-white p-2 rounded-lg border border-slate-200/70">
                      <div class="text-[10px] font-bold recomp-label text-slate-400">${t('rmseAvg')}</div>
                      <div class="text-sm font-mono font-extrabold text-slate-800">${item.activeRmse.toFixed(2)} <span class="text-[10px] font-normal text-slate-400">/ 255</span></div>
                    </div>
                    <div class="bg-white p-2 rounded-lg border border-slate-200/70">
                      <div class="text-[10px] font-bold recomp-label text-slate-400">${t('maxPixelError')}</div>
                      <div class="text-sm font-mono font-extrabold text-slate-800">${item.activeMaxError} <span class="text-[10px] font-normal text-slate-400">/ 255</span></div>
                    </div>
                  </div>

                  <div class="text-[11px] font-mono flex items-center justify-between pt-0.5">
                    <span class="text-slate-400">${t('outputDimensions')}</span>
                    ${scaleText}
                  </div>
                </div>
              </div>

              <!-- Primary Download CTA -->
              <div class="pt-1 flex items-center gap-2">
                <button onclick="downloadSingleItem(${index})"
                  class="flex-1 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold text-xs recomp-label shadow-sm shadow-sky-600/20 transition flex items-center justify-center gap-2">
                  <i class="fa-solid fa-download"></i>
                  <span>${t('download')} (${formatSizeKB(compKB)})</span>
                </button>
              </div>

            </div>

          </div>
        </article>
      `;
    }

    /**
     * Generates the Recompressor Signature Interactive SVG Chart:
     * X-Axis: File Size (KB), Y-Axis: RMSE Pixel Error (Lower is higher quality)
     */
    function buildCardSvgChart(item, itemIndex) {
      const W = 420;
      const H = 165;
      const padL = 42;
      const padR = 18;
      const padT = 18;
      const padB = 26;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;

      const pts = item.probePoints;
      if (!pts || pts.length === 0) return '';

      const activeKB = item.compSize / 1024;
      const maxKB = Math.max(
        item.origSize / 1024,
        ...pts.map(p => p.kb),
        item.mode === 'target' ? item.targetKB * 1.15 : 50,
        activeKB * 1.1,
        40
      );
      const maxRmse = Math.max(...pts.map(p => p.rmse), item.activeRmse, 8);

      const xForKB = (kb) => padL + Math.min(1, Math.max(0, kb / maxKB)) * plotW;
      const yForRmse = (rmse) => padT + plotH - Math.min(1, Math.max(0, rmse / maxRmse)) * plotH;

      let svg = `<svg viewBox="0 0 ${W} ${H}" class="w-full h-36 overflow-visible select-none">`;

      // Horizontal RMSE Grid Lines
      [0, 0.33, 0.66, 1].forEach((r) => {
        const y = padT + plotH * (1 - r);
        const val = (maxRmse * r).toFixed(1);
        svg += `
          <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />
          <text x="${padL - 6}" y="${y + 3}" text-anchor="end" fill="#64748b" font-family="JetBrains Mono" font-size="9">${val}</text>
        `;
      });

      // X-Axis File Size Labels
      [0, 0.25, 0.5, 0.75, 1].forEach((r) => {
        const x = padL + plotW * r;
        const kbVal = Math.round(maxKB * r);
        svg += `
          <line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="#f1f5f9" stroke-width="1" />
          <text x="${x}" y="${H - 6}" text-anchor="middle" fill="#64748b" font-family="JetBrains Mono" font-size="9">${kbVal}K</text>
        `;
      });

      // Axis Titles
      svg += `
        <text x="${padL + 4}" y="${padT + 9}" fill="#94a3b8" font-family="Inter" font-weight="700" font-size="8.5">${t('axisError')}</text>
        <text x="${W - padR}" y="${padT + plotH - 5}" text-anchor="end" fill="#94a3b8" font-family="Inter" font-weight="700" font-size="8.5">${t('axisSize')}</text>
      `;

      // Connect samples in file-size order while retaining their original indices.
      const coords = pts.map((p, idx) => ({
        x: xForKB(p.kb),
        y: yForRmse(p.rmse),
        ...p,
        idx
      }));

      const sortedCoords = [...coords].sort((a, b) => a.kb - b.kb);
      const dPath = sortedCoords.map((pt, i) => `${i ? 'L' : 'M'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');

      svg += `<path d="${dPath}" fill="none" stroke="#0284c7" stroke-width="2.4" stroke-linecap="round" />`;

      // Upgrade #1: Vertical Red Dashed Target Limit Line when Target KB Mode is active
      if (item.mode === 'target') {
        const tx = xForKB(item.targetKB);
        svg += `
          <line x1="${tx}" y1="${padT - 4}" x2="${tx}" y2="${padT + plotH}" stroke="#e11d48" stroke-width="1.6" stroke-dasharray="4,3" />
          <rect x="${Math.min(W - 82, Math.max(padL, tx - 40))}" y="${padT - 12}" width="80" height="14" rx="4" fill="#ffe4e6" stroke="#fda4af" stroke-width="0.8" />
          <text x="${Math.min(W - 42, Math.max(padL + 40, tx))}" y="${padT - 2}" text-anchor="middle" fill="#be123c" font-family="JetBrains Mono" font-size="8.5" font-weight="700">
            ${t('chartLimit')} ${item.targetKB}K
          </text>
        `;
      }

      // Render Interactive Probed Nodes
      coords.forEach((pt) => {
        const isKnee = pt.idx === item.kneeIndex;
        const isSelected = item.activePointIndex === pt.idx && item.mode !== 'target';

        svg += `
          <g role="button" tabindex="0" aria-label="${t('chartProbe')}${Math.round(pt.q * 100)}%" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectCardProbePoint(${itemIndex}, ${pt.idx})}" class="cursor-pointer" onclick="selectCardProbePoint(${itemIndex}, ${pt.idx})">
            <circle cx="${pt.x}" cy="${pt.y}" r="10" fill="transparent" />
            ${isKnee ? `<circle cx="${pt.x}" cy="${pt.y}" r="6.5" fill="none" stroke="#10b981" stroke-width="1.8" stroke-dasharray="2,2" />` : ''}
            <circle cx="${pt.x}" cy="${pt.y}" r="${isSelected ? 5 : 3.8}" fill="${isSelected ? '#0284c7' : '#ffffff'}" stroke="#0284c7" stroke-width="2" />
            <title>${item.outFormat === 'image/png' ? `${pt.width} × ${pt.height} px` : `${t('chartProbe')}${Math.round(pt.q * 100)}%`} • ${pt.kb.toFixed(1)} KB • RMSE ${pt.rmse}</title>
          </g>
        `;
      });

      // Highlight Currently Active Node (either Knee, Manual, or Exact Target Bullseye)
      const actX = xForKB(activeKB);
      const actY = yForRmse(item.activeRmse);
      const activeColor = item.mode === 'target' ? '#e11d48' : '#10b981';

      svg += `
        <g class="pointer-events-none">
          <circle cx="${actX}" cy="${actY}" r="9" fill="${activeColor}" opacity="0.28" class="chart-node-pulse" />
          <circle cx="${actX}" cy="${actY}" r="5.5" fill="${activeColor}" stroke="#ffffff" stroke-width="2" />
          <rect x="${Math.min(W - 106, Math.max(padL, actX - 52))}" y="${Math.max(2, actY - 24)}" width="104" height="16" rx="4" fill="#0f172a" />
          <text x="${Math.min(W - 54, Math.max(padL + 52, actX))}" y="${Math.max(13, actY - 13)}" text-anchor="middle" fill="#ffffff" font-family="JetBrains Mono" font-size="8.5" font-weight="700">
            ${activeKB.toFixed(1)}K • RMSE ${item.activeRmse}
          </text>
        </g>
      `;

      svg += `</svg>`;
      return svg;
    }

    function getSemanticQualityBadge(rmse) {
      if (rmse <= 2.2) {
        return { label: t('visuallyLossless'), classes: 'bg-emerald-100 text-emerald-800 border border-emerald-200' };
      } else if (rmse <= 4.8) {
        return { label: t('highQuality'), classes: 'bg-sky-100 text-sky-800 border border-sky-200' };
      } else if (rmse <= 8.5) {
        return { label: t('balanced'), classes: 'bg-amber-100 text-amber-800 border border-amber-200' };
      } else {
        return { label: t('heavyCompression'), classes: 'bg-rose-100 text-rose-800 border border-rose-200' };
      }
    }

    // ============================================================================
    // 7. PER-CARD & BATCH INTERACTION CONTROLLERS
    // ============================================================================
    async function selectCardProbePoint(itemIndex, ptIndex) {
      const item = state.items[itemIndex];
      if (!item || !item.probePoints[ptIndex]) return;
      item.mode = ptIndex === item.kneeIndex ? 'knee' : 'manual';
      item.targetNode = null;
      await applyChosenCandidate(item, item.probePoints[ptIndex], ptIndex);
      renderWorkspace();
    }

    async function setCardKneeMode(itemIndex) {
      const item = state.items[itemIndex];
      if (!item) return;
      item.mode = 'knee';
      item.targetNode = null;
      await applyChosenCandidate(item, item.probePoints[item.kneeIndex], item.kneeIndex);
      renderWorkspace();
    }

    async function setCardTargetKB(itemIndex, kb) {
      const item = state.items[itemIndex];
      if (!item) return;
      item.mode = 'target';
      item.targetKB = normalizeTargetKB(kb);
      await solveExactTargetKB(item);
      renderWorkspace();
      showToast(item.compSize <= item.targetKB * 1024 ? 'toastLocked' : 'targetClosest', { name: item.name, kb: item.targetKB, actual: (item.compSize / 1024).toFixed(1) });
    }

    async function applyCardCustomTarget(itemIndex) {
      const input = document.getElementById(`cardTargetInput_${itemIndex}`);
      if (!input) return;
      const val = parseFloat(input.value);
      await setCardTargetKB(itemIndex, isNaN(val) ? 150 : val);
    }

    async function setCardFormat(itemIndex, mime) {
      const item = state.items[itemIndex];
      if (!item || item.outFormat === mime) return;
      item.outFormat = mime;
      await probeAndSolveItem(item);
      renderWorkspace();
      showToast('toastConverted', { name: item.name, format: shortFormatLabel(mime) });
    }

    async function setCardManualQuality(itemIndex, qPct) {
      const item = state.items[itemIndex];
      if (!item) return;
      const numericQuality = Number(qPct);
      if (!Number.isFinite(numericQuality)) return;
      const q = Math.max(0.10, Math.min(0.98, numericQuality / 100));
      item.mode = 'manual';
      item.activeQuality = q;
      const cand = await encodeCandidate(item.imgElement, item.outFormat, q, 1.0);
      const err = await computeRmseAndMaxError(cand.blob, item.refGrid);
      item.targetNode = { ...cand, rmse: err.rmse, maxError: err.maxError, isManual: true };
      await applyChosenCandidate(item, item.targetNode, -1);
      renderWorkspace();
    }

    function removeImageItem(index) {
      const item = state.items[index];
      if (!item) return;
      closeLightbox();
      revokeItemUrls(item);
      state.items.splice(index, 1);
      renderWorkspace();
    }

    function clearAllImages() {
      closeLightbox();
      state.items.forEach(revokeItemUrls);
      state.items = [];
      renderWorkspace();
      showToast('cleared');
    }

    // Batch Global Strategy Controllers
    async function applyGlobalStrategy(mode, kbVal) {
      if (mode === 'target') kbVal = normalizeTargetKB(kbVal);
      document.querySelectorAll('.global-preset-btn').forEach((btn) => {
        btn.className = 'global-preset-btn px-2.5 py-1 rounded-lg font-mono font-semibold border border-slate-200 bg-white text-slate-700 hover:border-slate-300 transition';
      });

      if (mode === 'knee') {
        const kneeBtn = document.getElementById('globalBtnKnee');
        if (kneeBtn) kneeBtn.className = 'global-preset-btn px-2.5 py-1 rounded-lg font-semibold border border-sky-600 bg-sky-50 text-sky-700 transition';
      } else {
        const btn = document.getElementById(`globalBtn${kbVal}`);
        if (btn) btn.className = 'global-preset-btn px-2.5 py-1 rounded-lg font-mono font-semibold border border-rose-600 bg-rose-50 text-rose-700 transition';
        document.getElementById('globalCustomKBInput').value = kbVal;
      }

      for (const item of state.items) {
        if (mode === 'knee') {
          item.mode = 'knee';
          item.targetNode = null;
          await applyChosenCandidate(item, item.probePoints[item.kneeIndex], item.kneeIndex);
        } else {
          item.mode = 'target';
          item.targetKB = Number(kbVal);
          await solveExactTargetKB(item);
        }
      }
      renderWorkspace();
      showToast(mode === 'knee' ? 'batchKneeApplied' : 'toastBatchLocked', { count: state.items.length, kb: kbVal });
    }

    async function applyCustomGlobalKB() {
      const val = parseFloat(document.getElementById('globalCustomKBInput').value);
      const kb = isNaN(val) ? 150 : Math.max(10, Math.min(10240, val));
      await applyGlobalStrategy('target', kb);
    }

    async function applyGlobalFormat(choice) {
      for (const item of state.items) {
        if (choice === 'original') {
          item.outFormat = item.origFormat;
        } else if (choice === 'auto') {
          item.outFormat = item.origFormat === 'image/png' ? 'image/webp' : item.origFormat;
        } else {
          item.outFormat = choice;
        }
        await probeAndSolveItem(item);
      }
      renderWorkspace();
      showToast('batchFormatUpdated');
    }

    // ============================================================================
    // 8. FULL-SCREEN PIXEL LIGHTBOX INSPECTOR (ORIG / DIFF ×8 / COMP / SPLIT)
    // ============================================================================
    let lightboxReturnFocus = null;
    async function openLightbox(itemIndex, initialViewMode = 'split') {
      const item = state.items[itemIndex];
      if (!item) return;

      if (!state.lightbox.isOpen) lightboxReturnFocus = document.activeElement;
      state.lightbox.isOpen = true;
      state.lightbox.itemIndex = itemIndex;
      state.lightbox.viewMode = initialViewMode;
      state.lightbox.zoom = 'fit';
      state.lightbox.panX = 0;
      state.lightbox.panY = 0;

      document.getElementById('lightboxModal').classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      document.querySelector('[data-i18n-title="closeInspector"]').focus();
      await syncLightboxContent();
    }

    function closeLightbox() {
      const wasOpen = state.lightbox.isOpen;
      state.lightbox.isOpen = false;
      if (wasOpen && lightboxReturnFocus?.isConnected) lightboxReturnFocus.focus();
      lightboxRevision++;
      document.body.style.overflow = '';
      state.lightbox.isPanning = false;
      state.lightbox.isDraggingSplit = false;
      document.getElementById('lightboxModal').classList.add('hidden');
    }

    async function stepLightboxImage(delta) {
      if (state.items.length === 0) return;
      state.lightbox.itemIndex = (state.lightbox.itemIndex + delta + state.items.length) % state.items.length;
      state.lightbox.zoom = 'fit';
      state.lightbox.panX = 0;
      state.lightbox.panY = 0;
      await syncLightboxContent();
    }

    async function stepLightboxQuality(delta) {
      const item = state.items[state.lightbox.itemIndex];
      if (!item) return;
      const newQ = Math.max(0.10, Math.min(0.98, Number((item.activeQuality + delta * 0.08).toFixed(2))));
      await setCardManualQuality(state.lightbox.itemIndex, Math.round(newQ * 100));
      await syncLightboxContent();
    }

    async function setLightboxViewMode(mode) {
      state.lightbox.viewMode = mode;
      await syncLightboxContent();
    }

    let lightboxRevision = 0;
    async function syncLightboxContent() {
      const revision = ++lightboxRevision;
      const item = state.items[state.lightbox.itemIndex];
      if (!item || !state.lightbox.isOpen) return;
      const viewMode = state.lightbox.viewMode;
      const decoded = await decodeHtmlImage(viewMode === 'orig' ? item.origUrl : item.compUrl);
      if (revision !== lightboxRevision || !state.lightbox.isOpen) return;

      document.getElementById('lbImageCounter').textContent = `${state.lightbox.itemIndex + 1} / ${state.items.length}`;
      document.getElementById('lbFileName').textContent = item.name;

      const compKB = (item.compSize / 1024).toFixed(1);
      const origKB = (item.origSize / 1024).toFixed(1);
      const savedPct = ((1 - item.compSize / item.origSize) * 100).toFixed(1);
      const qPct = Math.round(item.activeQuality * 100);

      document.getElementById('lbPointMetrics').textContent = `${t(item.outFormat === 'image/png' ? 'pngSizeMetric' : 'qualityMetric')}${qPct}% • ${compKB} KB • RMSE ${item.activeRmse}`;
      document.getElementById('lbLeftBadgeStats').textContent = `${origKB} KB • ${item.width}×${item.height}`;
      document.getElementById('lbRightBadgeStats').textContent = `${compKB} KB (${Number(savedPct) >= 0 ? '-' : '+'}${Math.abs(Number(savedPct)).toFixed(1)}%) • RMSE ${item.activeRmse}`;

      // Update Mode Switcher Buttons
      const modeBtns = {
        orig: document.getElementById('lbModeOrig'),
        diff: document.getElementById('lbModeDiff'),
        comp: document.getElementById('lbModeComp'),
        split: document.getElementById('lbModeSplit')
      };
      Object.entries(modeBtns).forEach(([k, btn]) => {
        if (k === state.lightbox.viewMode) {
          btn.className = 'px-3 py-1 rounded-lg font-bold text-xs transition bg-sky-600 text-white shadow-sm flex items-center gap-1';
        } else {
          btn.className = 'px-3 py-1 rounded-lg font-bold text-xs transition text-slate-400 hover:text-white flex items-center gap-1';
        }
      });

      const baseImg = document.getElementById('lbBaseImg');
      const overlayOrigImg = document.getElementById('lbOverlayOrigImg');
      const splitOverlay = document.getElementById('lbSplitClipOverlay');
      const splitDivider = document.getElementById('lbSplitDivider');
      const diffCanvas = document.getElementById('lbDiffCanvas');
      const leftBadge = document.getElementById('lbLeftBadge');

      baseImg.src = decoded.src;
      baseImg.width = decoded.naturalWidth;
      baseImg.height = decoded.naturalHeight;
      const displayWidth = decoded.naturalWidth;
      const displayHeight = decoded.naturalHeight;
      overlayOrigImg.src = item.origUrl;
      overlayOrigImg.style.width = `${displayWidth}px`;
      overlayOrigImg.style.height = `${displayHeight}px`;

      if (state.lightbox.viewMode === 'split') {
        baseImg.classList.remove('hidden');
        diffCanvas.classList.add('hidden');
        splitOverlay.classList.remove('hidden');
        splitDivider.classList.remove('hidden');
        leftBadge.classList.remove('hidden');
      } else if (state.lightbox.viewMode === 'diff') {
        const nextDiff = document.createElement('canvas');
        await renderAmplifiedDiffCanvas(item, nextDiff, displayWidth, displayHeight);
        if (revision !== lightboxRevision || !state.lightbox.isOpen) return;
        diffCanvas.width = displayWidth;
        diffCanvas.height = displayHeight;
        diffCanvas.getContext('2d').drawImage(nextDiff, 0, 0);
        baseImg.classList.add('hidden');
        diffCanvas.classList.remove('hidden');
        splitOverlay.classList.add('hidden');
        splitDivider.classList.add('hidden');
        leftBadge.classList.add('hidden');
      } else if (state.lightbox.viewMode === 'orig') {
        baseImg.classList.remove('hidden');
        diffCanvas.classList.add('hidden');
        splitOverlay.classList.add('hidden');
        splitDivider.classList.add('hidden');
        leftBadge.classList.remove('hidden');
      } else {
        // 'comp'
        baseImg.classList.remove('hidden');
        diffCanvas.classList.add('hidden');
        splitOverlay.classList.add('hidden');
        splitDivider.classList.add('hidden');
        leftBadge.classList.add('hidden');
      }

      if (state.lightbox.zoom === 'fit') {
        fitLightboxStage();
      } else {
        applyLightboxTransform();
      }
    }

    /**
     * Recompressor Signature "Diff" View: Renders |Original - Compressed| * 8 per RGB channel
     * so compression block artifacts and edge ringing glow clearly against dark background.
     */
    async function renderAmplifiedDiffCanvas(item, canvas, w, h) {
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      const cOrig = document.createElement('canvas');
      cOrig.width = w;
      cOrig.height = h;
      const ctxOrig = cOrig.getContext('2d');
      ctxOrig.fillStyle = '#FFFFFF';
      ctxOrig.fillRect(0, 0, w, h);
      ctxOrig.drawImage(item.imgElement, 0, 0, w, h);

      const compImg = await decodeHtmlImage(item.compUrl);
      const cComp = document.createElement('canvas');
      cComp.width = w;
      cComp.height = h;
      const ctxComp = cComp.getContext('2d');
      ctxComp.fillStyle = '#FFFFFF';
      ctxComp.fillRect(0, 0, w, h);
      ctxComp.drawImage(compImg, 0, 0, w, h);

      const origData = ctxOrig.getImageData(0, 0, w, h).data;
      const compData = ctxComp.getImageData(0, 0, w, h).data;
      const outImgData = ctx.createImageData(w, h);
      const out = outImgData.data;

      const amp = 8; // 8x error amplification
      for (let i = 0; i < origData.length; i += 4) {
        out[i] = Math.min(255, Math.abs(origData[i] - compData[i]) * amp);
        out[i + 1] = Math.min(255, Math.abs(origData[i + 1] - compData[i + 1]) * amp);
        out[i + 2] = Math.min(255, Math.abs(origData[i + 2] - compData[i + 2]) * amp);
        out[i + 3] = 255;
      }
      ctx.putImageData(outImgData, 0, 0);
    }

    function setLightboxZoom(mode) {
      state.lightbox.zoom = mode;
      state.lightbox.panX = 0;
      state.lightbox.panY = 0;
      if (mode === 'fit') {
        fitLightboxStage();
      } else {
        state.lightbox.scale = Number(mode);
        applyLightboxTransform();
      }
      updateLightboxZoomButtons();
    }

    function zoomLightboxBy(factor) {
      state.lightbox.zoom = 'custom';
      state.lightbox.scale = Math.max(0.01, Math.min(4.0, state.lightbox.scale * factor));
      updateLightboxZoomButtons();
      applyLightboxTransform();
    }

    function fitLightboxStage() {
      const item = state.items[state.lightbox.itemIndex];
      if (!item) return;
      const vp = document.getElementById('lightboxViewport');
      const rect = vp.getBoundingClientRect();
      const baseImg = document.getElementById('lbBaseImg');
      const sx = (rect.width - 80) / baseImg.width;
      const sy = (rect.height - 90) / baseImg.height;
      state.lightbox.scale = Math.max(0.01, Math.min(1, Math.min(sx, sy)));
      state.lightbox.panX = 0;
      state.lightbox.panY = 0;
      updateLightboxZoomButtons();
      applyLightboxTransform();
    }

    function updateLightboxZoomButtons() {
      const fitBtn = document.getElementById('lbZoomFitBtn');
      const oneBtn = document.getElementById('lbZoom1to1Btn');
      fitBtn.className = state.lightbox.zoom === 'fit'
        ? 'px-2 py-1 rounded text-[11px] font-bold bg-sky-600 text-white'
        : 'px-2 py-1 rounded text-[11px] font-bold text-slate-300 hover:text-white';
      oneBtn.className = state.lightbox.zoom === 1
        ? 'px-2 py-1 rounded text-[11px] font-mono font-bold bg-sky-600 text-white'
        : 'px-2 py-1 rounded text-[11px] font-mono font-bold text-slate-300 hover:text-white';
    }

    function updateLightboxSplitPos(clientX) {
      const vp = document.getElementById('lightboxViewport');
      const rect = vp.getBoundingClientRect();
      const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      state.lightbox.splitPct = (relX / rect.width) * 100;
      syncLightboxSplitClip();
    }

    function applyLightboxTransform() {
      const stage = document.getElementById('lbStageContainer');
      stage.style.transform = `translate(${state.lightbox.panX}px, ${state.lightbox.panY}px) scale(${state.lightbox.scale})`;
      requestAnimationFrame(syncLightboxSplitClip);
    }

    function syncLightboxSplitClip() {
      if (state.lightbox.viewMode !== 'split') return;
      const divider = document.getElementById('lbSplitDivider');
      const overlay = document.getElementById('lbSplitClipOverlay');
      divider.style.left = `${state.lightbox.splitPct}%`;

      const vp = document.getElementById('lightboxViewport');
      const stage = document.getElementById('lbStageContainer');
      const vRect = vp.getBoundingClientRect();
      const sRect = stage.getBoundingClientRect();

      if (sRect.width > 0) {
        const splitScreenX = vRect.left + (state.lightbox.splitPct / 100) * vRect.width;
        const ratio = Math.max(0, Math.min(1, (splitScreenX - sRect.left) / sRect.width));
        const rightInset = (1 - ratio) * 100;
        overlay.style.clipPath = `inset(0 ${rightInset.toFixed(2)}% 0 0)`;
      }
    }

    function downloadLightboxActive() {
      downloadSingleItem(state.lightbox.itemIndex);
    }

    // ============================================================================
    // 9. SINGLE DOWNLOAD & PURE-JS CLIENT-SIDE .ZIP ARCHIVE GENERATOR (UPGRADE #6)
    // ============================================================================
    function buildOutputFilename(item) {
      const base = item.name.replace(/\.[^/.]+$/, '').replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').slice(0, 180) || 'image';
      const extMap = { 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/png': '.png' };
      const ext = extMap[item.outFormat] || '.jpg';
      const kbStr = Math.round(item.compSize / 1024);
      return `${base}-recomp-${kbStr}kb${ext}`;
    }

    function downloadSingleItem(index) {
      const item = state.items[index];
      if (!item || !item.compBlob) return;
      const filename = buildOutputFilename(item);
      triggerBrowserDownload(item.compBlob, filename);
      showToast('toastDownloaded', { name: filename });
    }

    /**
     * Pure-JavaScript Standard ZIP File Builder (Store Method 0 + CRC32)
     * Packages all compressed image Blobs into a single downloadable .zip archive locally.
     */
    async function downloadAllAsZip() {
      if (state.items.length === 0) {
        showToast('noDownloads');
        return;
      }

      const filesData = [];
      const usedNames = new Set();

      for (const item of state.items) {
        if (!item.compBlob) continue;
        let name = buildOutputFilename(item);
        const originalName = name;
        let suffix = 1;
        while (usedNames.has(name.toLowerCase())) {
          name = originalName.replace(/(\.[^.]+)$/, `-${suffix++}$1`);
        }
        usedNames.add(name.toLowerCase());
        const uint8 = new Uint8Array(await item.compBlob.arrayBuffer());
        filesData.push({ name, data: uint8 });
      }

      const zipBlob = createStoreZipBlob(filesData);
      triggerBrowserDownload(zipBlob, `recompressor-exactkb-${filesData.length}-images.zip`);
      showToast('toastZip', { count: filesData.length });
    }

    // ============================================================================
    // 10. UTILITY HELPERS
    // ============================================================================
    function shortFormatLabel(mime) {
      if (mime === 'image/jpeg') return 'JPG';
      if (mime === 'image/webp') return 'WEBP';
      if (mime === 'image/png') return 'PNG';
      return 'IMG';
    }

    function formatSizeKB(kb) {
      if (kb >= 1024) return `${(kb / 1024).toFixed(2)} MB`;
      return `${kb.toFixed(1)} KB`;
    }

    function formatBytes(bytes) {
      return formatSizeKB(bytes / 1024);
    }

    let toastTimer = null;
    let toastMessage = { key: 'ready', params: {} };
    function showToast(key, params = {}) {
      toastMessage = { key, params };
      const box = document.getElementById('toastNotification');
      document.getElementById('toastMessage').textContent = t(key, params);
      box.classList.remove('opacity-0', 'translate-y-2');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        box.classList.add('opacity-0', 'translate-y-2');
      }, 2800);
    }

    function escapeHTML(value) {
      return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function normalizeTargetKB(value) {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? Math.max(10, Math.min(10240, number)) : 150;
    }

    // A single transaction prevents canvas jobs from publishing stale formats or URLs.
    let processing = false;
    function withProcessing(operation) {
      return async function (...args) {
        if (processing) { showToast('processingBusy'); return; }
        processing = true;
        document.body.setAttribute('aria-busy', 'true');
        document.getElementById('processingStatus').hidden = false;
        const snapshots = state.items.map(item => [item, { ...item }]);
        try {
          return await operation(...args);
        } catch (error) {
          snapshots.forEach(([item, snapshot]) => {
            if (state.items.includes(item)) {
              if (item.compUrl) URL.revokeObjectURL(item.compUrl);
              Object.assign(item, snapshot);
              if (item.compBlob) item.compUrl = URL.createObjectURL(item.compBlob);
            }
          });
          renderWorkspace();
          showToast('processingFailed');
          console.warn('Image operation failed:', error);
        } finally {
          processing = false;
          document.body.removeAttribute('aria-busy');
          document.getElementById('processingStatus').hidden = true;
          document.getElementById('fileInput').value = '';
        }
      };
    }

    addSampleSpecimens = withProcessing(addSampleSpecimens);
    ingestFileList = withProcessing(ingestFileList);
    selectCardProbePoint = withProcessing(selectCardProbePoint);
    setCardKneeMode = withProcessing(setCardKneeMode);
    setCardTargetKB = withProcessing(setCardTargetKB);
    setCardFormat = withProcessing(setCardFormat);
    setCardManualQuality = withProcessing(setCardManualQuality);
    applyGlobalStrategy = withProcessing(applyGlobalStrategy);
    applyGlobalFormat = withProcessing(applyGlobalFormat);
    removeImageItem = withProcessing(removeImageItem);
    clearAllImages = withProcessing(clearAllImages);
    downloadAllAsZip = withProcessing(downloadAllAsZip);

    window.addEventListener('resize', () => {
      if (state.lightbox.isOpen && state.lightbox.zoom === 'fit') fitLightboxStage();
    });

    document.addEventListener('click', event => {
      if (processing && event.target.closest('button, label, input, select') &&
          !event.target.closest('#langSelect, [data-i18n-title="closeInspector"]')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showToast('processingBusy');
      }
    }, true);
