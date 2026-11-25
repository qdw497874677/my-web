import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { OwnerSessionProvider, RequireOwner } from "./OwnerSessionProvider";
import { useOwnerSession } from "./owner-session";
import { fetchApi } from "../shared/http";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const session = (id = "one") => new Response(JSON.stringify({ authenticated: true, owner: { id, email: `${id}@example.com` } }), { status: 200 });
const failure = (status: number) => new Response(JSON.stringify({ error: "error" }), { status });

function Controls() {
  const { owner, login, logout, logoutError } = useOwnerSession();
  return <>
    <span data-testid="owner">{owner?.id ?? "none"}</span>
    <span data-testid="logout-error">{logoutError}</span>
    <button onClick={() => { void login("a", "b").catch(() => {}); }}>login</button>
    <button onClick={() => { void logout(); }}>logout</button>
    <button onClick={() => { void fetchApi("/api/admin/articles").catch(() => {}); }}>admin request</button>
  </>;
}
function App({ initial = "/admin/one" }: { initial?: string }) {
  return <MemoryRouter initialEntries={[initial]}><OwnerSessionProvider><Routes>
    <Route path="/" element={<><div>public page</div><Link to="/admin/one">protected</Link><Link to="/admin/login">sign in</Link></>} />
    <Route path="/admin">
      <Route path="login" element={<><div>login page</div><Link to="/">public</Link><Controls /></>} />
      <Route element={<RequireOwner />}>
        <Route path="one" element={<><div>private one</div><Link to="/admin/two">next</Link><Link to="/">public</Link><Controls /></>} />
        <Route path="two" element={<><div>private two</div><Link to="/">public</Link><Controls /></>} />
      </Route>
    </Route>
  </Routes></OwnerSessionProvider></MemoryRouter>;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("owner session boundary", () => {
  it("waits for a real session before mounting private content and retries initial failures", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(session()));
    render(<App />);
    expect(screen.queryByText("private one")).not.toBeInTheDocument();
    await act(async () => pending.resolve(failure(500)));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByText("重试"));
    expect(await screen.findByText("private one")).toBeInTheDocument();
  });

  it("revalidates navigation without blanking and ignores superseded validation", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(session()).mockReturnValueOnce(pending.promise));
    render(<App />);
    await screen.findByText("private one");
    fireEvent.click(screen.getByText("next"));
    expect(screen.getByText("private two")).toBeInTheDocument();
    fireEvent.click(screen.getByText("logout"));
    await screen.findByText("login page");
    await act(async () => pending.resolve(session("stale")));
    expect(screen.getByTestId("owner")).toHaveTextContent("none");
  });

  it("requires a fresh session before remounting the protected branch after public navigation", async () => {
    const reentry = deferred<Response>();
    const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockReturnValueOnce(reentry.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText("private one");
    fireEvent.click(screen.getByText("public"));
    await screen.findByText("public page");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("protected"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("private one")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    await act(async () => reentry.resolve(failure(401)));
    await screen.findByText("login page");
    expect(screen.queryByText("private one")).not.toBeInTheDocument();
  });

  it("shows retry on a failed fresh guard check even when an old owner exists", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(failure(503))
      .mockResolvedValueOnce(session());
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText("private one");
    fireEvent.click(screen.getByText("public"));
    fireEvent.click(screen.getByText("protected"));
    await screen.findByRole("alert");
    expect(screen.queryByText("private one")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("重试"));
    await screen.findByText("private one");
  });

  it("ignores a login response after leaving the login route", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(pending.promise));
    render(<App initial="/admin/login" />);
    fireEvent.click(screen.getByText("login"));
    fireEvent.click(screen.getByText("public"));
    await act(async () => pending.resolve(session("stale")));
    expect(screen.getByText("public page")).toBeInTheDocument();
    fireEvent.click(screen.getByText("sign in"));
    expect(screen.getByTestId("owner")).toHaveTextContent("none");
  });

  it("does not log out on a failed revalidation but redirects on a current 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(failure(503))
      .mockResolvedValueOnce(failure(401)));
    render(<App />);
    await screen.findByText("private one");
    fireEvent.click(screen.getByText("next"));
    await waitFor(() => expect(screen.getByTestId("owner")).toHaveTextContent("one"));
    fireEvent.click(screen.getByText("admin request"));
    await screen.findByText("login page");
    expect(screen.getByTestId("owner")).toHaveTextContent("none");
  });

  it("redirects unauthenticated direct visits without mounting private content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failure(401)));
    render(<App />);
    await screen.findByText("login page");
    expect(screen.queryByText("private one")).not.toBeInTheDocument();
  });

  it("blocks login until logout settles and reports an unconfirmed logout", async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(session("new"));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText("private one");
    fireEvent.click(screen.getByText("logout"));
    await screen.findByText("login page");
    fireEvent.click(screen.getByText("login"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve(failure(500)));
    expect(screen.getByTestId("logout-error")).not.toBeEmptyDOMElement();
    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("owner")).toHaveTextContent("new"));
    expect(screen.getByTestId("logout-error")).toBeEmptyDOMElement();
  });

  it("keeps logout pending across public navigation and rejects protected reentry until login", async () => {
    const logout = deferred<Response>();
    const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockReturnValueOnce(logout.promise)
      .mockResolvedValueOnce(session("new"));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText("private one");
    fireEvent.click(screen.getByText("logout"));
    await screen.findByText("login page");
    fireEvent.click(screen.getByText("public"));
    await screen.findByText("public page");
    fireEvent.click(screen.getByText("protected"));
    await screen.findByText("login page");
    expect(screen.queryByText("private one")).not.toBeInTheDocument();
    expect(screen.getByTestId("owner")).toHaveTextContent("none");
    fireEvent.click(screen.getByText("login"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => logout.resolve(new Response(null, { status: 204 })));
    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("owner")).toHaveTextContent("new"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("serializes login cookie writes and waits for pending login before logout", async () => {
    const login = deferred<Response>();
    const logout = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(login.promise).mockReturnValueOnce(logout.promise)
      .mockResolvedValueOnce(session("new"));
    vi.stubGlobal("fetch", fetchMock);
    render(<App initial="/admin/login" />);
    fireEvent.click(screen.getByText("login"));
    fireEvent.click(screen.getByText("login"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("logout"));
    fireEvent.click(screen.getByText("login"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => login.resolve(session("stale")));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/logout");
    expect(screen.getByTestId("owner")).toHaveTextContent("none");
    fireEvent.click(screen.getByText("login"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => logout.resolve(new Response(null, { status: 204 })));
    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("owner")).toHaveTextContent("new"));
  });

  it("ignores a prior session's admin 401 after login, but expires the current session", async () => {
    const oldRequest = deferred<Response>();
    const currentRequest = deferred<Response>();
    const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(session("new"))
      .mockReturnValueOnce(currentRequest.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText("private one");
    fireEvent.click(screen.getByText("admin request"));
    fireEvent.click(screen.getByText("logout"));
    await screen.findByText("login page");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await act(async () => {});
    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("owner")).toHaveTextContent("new"));
    await act(async () => oldRequest.resolve(failure(401)));
    expect(screen.getByTestId("owner")).toHaveTextContent("new");
    fireEvent.click(screen.getByText("admin request"));
    await act(async () => currentRequest.resolve(failure(401)));
    expect(screen.getByTestId("owner")).toHaveTextContent("none");
  });
});
