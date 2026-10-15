import { useEffect, useState } from 'react';
import { getUrl } from 'aws-amplify/storage';

export function usePhotoUrl(photoKey: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoKey) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    getUrl({ path: photoKey })
      .then(({ url: signedUrl }) => {
        if (!cancelled) setUrl(signedUrl.toString());
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [photoKey]);

  return url;
}
