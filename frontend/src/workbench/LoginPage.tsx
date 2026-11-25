import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MixedHeadline } from "../components/editorial";
import { Button, TextField } from "../components/ui";
import { useOwnerSession } from "./owner-session";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请稍后重试。";

export function LoginPage() {
  const navigate = useNavigate(),
    { login, logoutError } = useOwnerSession();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(email, password);
      navigate("/admin/dashboard");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="loginPage">
      <section className="loginStory">
        <a className="brand" href="/">
          <span className="brandMark">林</span>
          <span>林间刊物</span>
        </a>
        <div>
          <p className="eyebrow">EDITORIAL DESK / 04</p>
          <MixedHeadline as="h2">
            回到文字与影像的<em>工作台</em>
          </MixedHeadline>
          <p className="lead">编辑、编排并发布林间刊物的文章与相册。这里仅向刊物所有者开放。</p>
        </div>
      </section>
      <section className="loginPanel">
        <div className="loginCard">
          <p className="eyebrow">仅刊物所有者</p>
          <MixedHeadline>
            进入<em>编辑部</em>
          </MixedHeadline>
          <form className="formStack" onSubmit={(event) => void submit(event)}>
            <TextField
              id="admin-email"
              label="电子邮箱"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <TextField
              id="admin-password"
              label="密码"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? "正在登录..." : "进入工作台"}
            </Button>
            {logoutError && (
              <p className="error" role="alert">
                退出登录状态未确认，请重新登录。
              </p>
            )}
            <p className="error" aria-live="polite">
              {error}
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
