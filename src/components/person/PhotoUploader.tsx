import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { User } from 'lucide-react';
import { client } from '@/amplify-client';
import { usePhotoUrl } from '@/hooks/usePhotoUrl';
import { isPhotoTooLarge, uploadPersonPhoto, deletePersonPhoto } from '@/lib/photoStorage';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export interface PhotoUploaderProps {
  personId: string;
  personName: string;
  photoKey: string | null | undefined;
  onUploaded: (newPhotoKey: string) => void;
}

export function PhotoUploader({ personId, personName, photoKey, onUploaded }: PhotoUploaderProps) {
  const url = usePhotoUrl(photoKey);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (isPhotoTooLarge(file)) {
      toast.error('Photo must be under 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const newKey = await uploadPersonPhoto(personId, file);
      const { errors } = await client.models.Person.update({
        id: personId,
        photoKey: newKey,
      } as any);
      if (errors) {
        toast.error(errors.map((err) => err.message).join(', '));
        return;
      }
      if (photoKey) {
        deletePersonPhoto(photoKey).catch(() => {});
      }
      onUploaded(newKey);
      toast.success('Photo updated');
    } catch {
      toast.error('Failed to upload photo');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-20">
        <AvatarImage src={url ?? undefined} alt={personName} />
        <AvatarFallback>
          <User className="size-8" />
        </AvatarFallback>
      </Avatar>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? 'Uploading...' : photoKey ? 'Replace photo' : 'Upload photo'}
        </Button>
        <p className="text-muted-foreground mt-1 text-xs">Max 5MB</p>
      </div>
    </div>
  );
}
