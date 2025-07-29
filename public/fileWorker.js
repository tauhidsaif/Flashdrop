// fileWorker.js

self.onmessage = function (e) {
  const { file, offset, chunkSize } = e.data;

  try {
    const reader = new FileReader();

    reader.onload = (event) => {
      const buffer = event.target.result;
      // ✅ Use transferable object to avoid memory copying
      self.postMessage(
        {
          buffer,
          offset,
        },
        [buffer] // Transferring the ownership of the ArrayBuffer
      );
    };

    reader.onerror = (err) => {
      self.postMessage({ error: err.message });
    };

    const chunk = file.slice(offset, offset + chunkSize);
    reader.readAsArrayBuffer(chunk);
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};
