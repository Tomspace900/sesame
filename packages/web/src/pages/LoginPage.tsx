import { Button } from "@/components/ui/Button.tsx";
import { Icon } from "@/components/ui/Icon.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { Label } from "@/components/ui/Label.tsx";
import { supabase } from "@/lib/supabase.ts";
import { zodResolver } from "@hookform/resolvers/zod";
import Alert02Icon from "@hugeicons/core-free-icons/Alert02Icon";
import CheckmarkCircle02Icon from "@hugeicons/core-free-icons/CheckmarkCircle02Icon";
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Saisis ton adresse email")
    .email("Cette adresse email ne semble pas valide"),
});

type LoginForm = z.infer<typeof loginSchema>;
type LoginState = "idle" | "loading" | "success" | "error";

export function LoginPage(): React.JSX.Element {
  const [state, setState] = useState<LoginState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm): Promise<void> => {
    setState("loading");
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email: data.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      setState("error");
      setErrorMessage("Impossible d'envoyer le lien. Réessaie dans un instant.");
    } else {
      setState("success");
    }
  };

  return (
    <div className="min-h-svh bg-sesame-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-heading font-bold text-4xl text-sesame-text tracking-tight mb-2">
            Sésame
          </h1>
          <p className="text-sesame-text-muted font-body text-sm">Ton coffre-fort intelligent</p>
        </div>

        <div className="bg-sesame-surface border-2 border-sesame-text rounded-xl shadow-brutal p-6">
          {state === "success" ? (
            <div className="text-center py-4">
              <div
                className="flex items-center gap-3 p-4 rounded-lg mb-4"
                style={{ backgroundColor: "rgba(204, 255, 0, 0.15)" }}
                role="status"
              >
                <Icon
                  icon={CheckmarkCircle02Icon}
                  size={20}
                  color="#2A241F"
                  strokeWidth={2}
                  aria-hidden={true}
                />
                <p className="text-sesame-text font-body text-sm text-left">
                  C&apos;est envoyé — vérifie ta boîte mail
                </p>
              </div>
              <p className="text-sesame-text-muted font-body text-xs">
                Lien envoyé à{" "}
                <span className="font-medium text-sesame-text">{getValues("email")}</span>
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => void handleSubmit(onSubmit)(e)}
              noValidate
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Adresse email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="toi@exemple.fr"
                  autoComplete="email"
                  autoFocus
                  aria-invalid={errors.email !== undefined}
                  {...register("email")}
                />
                {errors.email !== undefined && (
                  <p className="text-sesame-danger text-xs font-body" role="alert">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {state === "error" && (
                <div
                  className="flex items-center gap-2 p-3 rounded"
                  style={{ backgroundColor: "rgba(255, 0, 85, 0.1)" }}
                  role="alert"
                >
                  <Icon
                    icon={Alert02Icon}
                    size={16}
                    color="#FF0055"
                    strokeWidth={2}
                    aria-hidden={true}
                  />
                  <p className="text-sesame-text text-xs font-body">{errorMessage}</p>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={state === "loading"}
                className="w-full"
              >
                {state === "loading" ? (
                  <>
                    <Icon
                      icon={Loading03Icon}
                      size={18}
                      color="currentColor"
                      strokeWidth={2}
                      aria-hidden={true}
                    />
                    Envoi en cours...
                  </>
                ) : (
                  "Recevoir un lien de connexion"
                )}
              </Button>

              <p className="text-sesame-text-muted text-xs font-body text-center">
                Un lien sera envoyé à ton adresse pour te connecter
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
