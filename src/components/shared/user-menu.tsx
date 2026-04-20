import { logout } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';

type Props = {
  email: string;
  fullName: string | null;
  rol: string;
};

export function UserMenu({ email, fullName, rol }: Props) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-right text-sm">
        <p className="font-medium">{fullName ?? email}</p>
        <p className="text-muted-foreground text-xs">{rol}</p>
      </div>
      <form action={logout}>
        <Button type="submit" variant="outline" size="sm">
          Salir
        </Button>
      </form>
    </div>
  );
}
