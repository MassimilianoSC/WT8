import { SetPasswordForm } from "@/components/auth/set-password-form";

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  return (
    <SetPasswordForm
      flow="reset"
      token={searchParams.token || ""}
      endpoint="/api/auth/reset-password"
      title="Imposta una nuova password"
      subtitle="Inserisci una nuova password per il tuo account."
      cta="Reimposta password"
    />
  );
}
