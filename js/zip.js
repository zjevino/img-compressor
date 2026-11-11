    function createStoreZipBlob(entries) {
      if (entries.length > 65535) throw new Error('ZIP64 is required for this many files');
      const encoder = new TextEncoder();
      const localParts = [];
      const centralParts = [];
      let offset = 0;

      for (const entry of entries) {
        const nameBytes = encoder.encode(entry.name);
        const crc = computeCrc32(entry.data);
        const size = entry.data.length;
        if (nameBytes.length > 65535 || size > 0xFFFFFFFF || offset + 30 + nameBytes.length + size > 0xFFFFFFFF) {
          throw new Error('Archive exceeds standard ZIP limits');
        }

        // Local File Header (30 bytes + filename)
        const lfh = new Uint8Array(30 + nameBytes.length);
        const lfhView = new DataView(lfh.buffer);
        lfhView.setUint32(0, 0x04034b50, true); // Signature
        lfhView.setUint16(4, 20, true);         // Version needed
        lfhView.setUint16(6, 0x0800, true);     // UTF-8 flag
        lfhView.setUint16(8, 0, true);          // Store method (0)
        lfhView.setUint16(10, 0, true);         // Mod time
        lfhView.setUint16(12, 0x5421, true);    // Mod date
        lfhView.setUint32(14, crc, true);       // CRC32
        lfhView.setUint32(18, size, true);      // Compressed size
        lfhView.setUint32(22, size, true);      // Uncompressed size
        lfhView.setUint16(26, nameBytes.length, true);
        lfhView.setUint16(28, 0, true);         // Extra length
        lfh.set(nameBytes, 30);

        localParts.push(lfh, entry.data);

        // Central Directory Header (46 bytes + filename)
        const cdh = new Uint8Array(46 + nameBytes.length);
        const cdhView = new DataView(cdh.buffer);
        cdhView.setUint32(0, 0x02014b50, true); // Signature
        cdhView.setUint16(4, 20, true);         // Version made by
        cdhView.setUint16(6, 20, true);         // Version needed
        cdhView.setUint16(8, 0x0800, true);     // UTF-8 flag
        cdhView.setUint16(10, 0, true);         // Store method
        cdhView.setUint16(12, 0, true);
        cdhView.setUint16(14, 0x5421, true);
        cdhView.setUint32(16, crc, true);
        cdhView.setUint32(20, size, true);
        cdhView.setUint32(24, size, true);
        cdhView.setUint16(28, nameBytes.length, true);
        cdhView.setUint16(30, 0, true);
        cdhView.setUint16(32, 0, true);
        cdhView.setUint16(34, 0, true);
        cdhView.setUint16(36, 0, true);
        cdhView.setUint32(38, 0, true);
        cdhView.setUint32(42, offset, true);    // Local header offset
        cdh.set(nameBytes, 46);

        centralParts.push(cdh);
        offset += lfh.length + size;
      }

      const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
      if (offset + centralSize + 22 > 0xFFFFFFFF) throw new Error('Archive exceeds standard ZIP limits');
      const eocd = new Uint8Array(22);
      const eocdView = new DataView(eocd.buffer);
      eocdView.setUint32(0, 0x06054b50, true);
      eocdView.setUint16(4, 0, true);
      eocdView.setUint16(6, 0, true);
      eocdView.setUint16(8, entries.length, true);
      eocdView.setUint16(10, entries.length, true);
      eocdView.setUint32(12, centralSize, true);
      eocdView.setUint32(16, offset, true);
      eocdView.setUint16(20, 0, true);

      return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
    }

    // Precomputed CRC32 Table
    const CRC32_TABLE = (() => {
      const tbl = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        tbl[i] = c >>> 0;
      }
      return tbl;
    })();

    function computeCrc32(uint8) {
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < uint8.length; i++) {
        crc = CRC32_TABLE[(crc ^ uint8[i]) & 0xFF] ^ (crc >>> 8);
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function triggerBrowserDownload(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

