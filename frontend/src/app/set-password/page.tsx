import { SetPasswordForm } from "@/components/auth/set-password-form";

export default function SetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  return (
    <SetPasswordForm
      flow="invite"
      token={searchParams.token || ""}
      endpoint="/api/auth/set-password"
      title="Imposta la tua password"
      subtitle="Benvenuto in WT8. Crea una password per attivare il tuo account."
      cta="Attiva account"
    />
  );
}
