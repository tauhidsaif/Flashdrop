self.onmessage = function (e) {
  const { file, offset, chunkSize } = e.data;
  const reader = new FileReader();

  reader.onload = (event) => {
    const buffer = event.target.result;
    self.postMessage(
      {
        buffer,
        offset,
      },
      [buffer] // ✅ Transfer instead of copy to improve performance
    );
  };

  reader.onerror = (err) => {
    self.postMessage({ error: err });
  };

  const chunk = file.slice(offset, offset + chunkSize);
  reader.readAsArrayBuffer(chunk);
};
