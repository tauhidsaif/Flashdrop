<<<<<<< HEAD
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
    [buffer] // <-- ✅ Transfer instead of copy
  );
};

  reader.onerror = (err) => {
    self.postMessage({ error: err });
  };

  const chunk = file.slice(offset, offset + chunkSize);
  reader.readAsArrayBuffer(chunk);
};
=======
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
>>>>>>> 2a0bbd6b52bd6a699a23bbcb96bb7b602bc98890
