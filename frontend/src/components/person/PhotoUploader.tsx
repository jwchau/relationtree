import { useRef } from 'react';
import { toast } from 'sonner';
import type { Person } from '@/api/client';
import { useRemovePhoto, useUploadPhoto } from '@/hooks/usePerson';
import { ALLOWED_PHOTO_TYPES, photoProblem } from '@/lib/photoStorage';
import { PersonAvatar } from '@/components/person/PersonAvatar';
import { Button } from '@/components/ui/button';

export function PhotoUploader({ person, readOnly = false }: { person: Person; readOnly?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadPhoto = useUploadPhoto(person.id);
  const removePhoto = useRemovePhoto(person.id);
  const busy = uploadPhoto.isPending || removePhoto.isPending;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const problem = photoProblem(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    uploadPhoto.mutate(file, {
      onSuccess: () => toast.success('Photo updated'),
      onError: (err) => toast.error(err.message),
    });
  }

  function handleRemove() {
    removePhoto.mutate(undefined, {
      onSuccess: () => toast.success('Photo removed'),
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <div className="flex items-center gap-4">
      <PersonAvatar name={person.name} photoUrl={person.photo_url} className="size-20 text-2xl" />
      {!readOnly && (
        <div className="min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_PHOTO_TYPES.join(',')}
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {uploadPhoto.isPending ? 'Uploading...' : person.photo_url ? 'Replace photo' : 'Upload photo'}
            </Button>
            {person.photo_url && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={handleRemove}>
                Remove
              </Button>
            )}
          </div>
          <p className="text-muted-foreground mt-2 text-[14px] leading-5">JPEG, PNG, WebP or GIF, max 5MB</p>
        </div>
      )}
    </div>
  );
}
