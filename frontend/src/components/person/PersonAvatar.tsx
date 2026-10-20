import { initials } from '@/lib/people';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/** A person's photo, or their initials on a quiet tile when there isn't one. */
export function PersonAvatar({
  name,
  photoUrl,
  className,
}: {
  name: string;
  photoUrl: string | null | undefined;
  className?: string;
}) {
  return (
    <Avatar className={cn('size-10', className)}>
      <AvatarImage src={photoUrl ?? undefined} alt="" />
      <AvatarFallback aria-hidden>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
