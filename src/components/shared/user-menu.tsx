import { logout } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';

type Props = {
  email: string;
  fullName: string | null;
  role: string;
};

export function UserMenu({ email, fullName, role }: Props) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-right text-sm">
        <p className="font-medium">{fullName ?? email}</p>
        <p className="text-muted-foreground text-xs">{role}</p>
      </div>
      <form action={logout}>
        <Button type="submit" variant="outline" size="sm">
          Salir
        </Button>
      </form>
    </div>
  );
}
