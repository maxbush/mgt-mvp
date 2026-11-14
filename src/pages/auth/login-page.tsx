import { useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginPage() {
  const login = useAppStore((s) => s.login);
  const setDataMode = useAppStore((s) => s.setDataMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setBusy(true);
    const r = await login(username, password);
    setBusy(false);
    if (!r.ok) setErr(r.reason);
    else toast.success("Вход выполнен");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="size-6" />
          </div>
          <div>
            <div className="text-[15px] font-semibold">Инженерная школа</div>
            <div className="text-[12px] text-muted-foreground">Вход в CRM</div>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[12.5px] font-medium">Логин</label>
            <Input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" />
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-medium">Пароль</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
        </div>
        {err && <div className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">{err}</div>}
        <Button className="mt-5 w-full" disabled={busy || !username || !password}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Войти
        </Button>
        <button
          type="button"
          className="mt-4 w-full text-center text-[12px] text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setDataMode("demo")}
        >
          Открыть демо-режим (без сервера)
        </button>
      </form>
    </div>
  );
}
