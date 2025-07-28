self.onmessage = function (e) {
  const { file, offset, chunkSize } = e.data;
  const reader = new FileReader();

  reader.onload = (event) => {
    self.postMessage({
      buffer: event.target.result,
      offset,
    });
  };

  reader.onerror = (err) => {
    self.postMessage({ error: err });
  };

  const chunk = file.slice(offset, offset + chunkSize);
  reader.readAsArrayBuffer(chunk);
};
