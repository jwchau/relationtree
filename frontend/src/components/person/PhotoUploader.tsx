import { User } from 'lucide-react';
import { usePhotoUrl } from '@/hooks/usePhotoUrl';
import { PHOTO_UPLOADS_ENABLED } from '@/lib/photoStorage';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export interface PhotoUploaderProps {
  personName: string;
  photoKey: string | null | undefined;
}

// Upload flow returns in M10 (presigned PUT to R2); for now this only shows the avatar.
export function PhotoUploader({ personName, photoKey }: PhotoUploaderProps) {
  const url = usePhotoUrl(photoKey);

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-20">
        <AvatarImage src={url ?? undefined} alt={personName} />
        <AvatarFallback>
          <User className="size-8" />
        </AvatarFallback>
      </Avatar>
      <div>
        <Button type="button" variant="outline" size="sm" disabled={!PHOTO_UPLOADS_ENABLED}>
          Upload photo
        </Button>
        <p className="text-muted-foreground mt-1 text-xs">Photo uploads are coming back soon.</p>
      </div>
    </div>
  );
}
