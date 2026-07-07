import { useState, useCallback, useRef } from "react";

interface UseUploadOptions {
  apiUrl: string;
  onUploaded: (url: string, name: string) => void;
}

export function useUpload({ apiUrl, onUploaded }: UseUploadOptions) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [remaining, setRemaining] = useState("");
  const [error, setError] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const uploadFile = useCallback((file: File) => {
    if (file.size > 500 * 1024 * 1024) {
      setError("Файл слишком большой (макс. 500 МБ)");
      return;
    }

    setUploading(true);
    setProgress(0);
    setSpeed(0);
    setRemaining("");
    setError(null);

    const startTime = Date.now();
    let lastLoaded = 0;
    let lastTime = startTime;

    const formData = new FormData();
    formData.append("video", file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setProgress(pct);

        const now = Date.now();
        const dt = (now - lastTime) / 1000;
        if (dt >= 0.5) {
          const bytesPerSec = (e.loaded - lastLoaded) / dt;
          const remainingBytes = e.total - e.loaded;
          const remainingSec = bytesPerSec > 0 ? remainingBytes / bytesPerSec : 0;

          setSpeed(bytesPerSec);
          if (remainingSec > 60) {
            setRemaining(`${Math.ceil(remainingSec / 60)} мин`);
          } else if (remainingSec > 0) {
            setRemaining(`${Math.ceil(remainingSec)} сек`);
          } else {
            setRemaining("");
          }

          lastLoaded = e.loaded;
          lastTime = now;
        }
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText);
        onUploaded(`${apiUrl}${result.url}`, result.originalName || file.name);
      } else {
        setError(`Ошибка ${xhr.status}`);
      }
      setUploading(false);
      setProgress(0);
      setSpeed(0);
      setRemaining("");
      xhrRef.current = null;
    });

    xhr.addEventListener("error", () => {
      setError("Ошибка загрузки");
      setUploading(false);
      setProgress(0);
      setSpeed(0);
      setRemaining("");
      xhrRef.current = null;
    });

    xhr.addEventListener("abort", () => {
      setError("Загрузка отменена");
      setUploading(false);
      setProgress(0);
      setSpeed(0);
      setRemaining("");
      xhrRef.current = null;
    });

    xhr.open("POST", `${apiUrl}/api/upload`);
    xhr.send(formData);
  }, [apiUrl, onUploaded]);

  const cancel = useCallback(() => {
    xhrRef.current?.abort();
  }, []);

  return {
    uploading,
    progress,
    speed,
    remaining,
    error,
    uploadFile,
    cancel,
  };
}
