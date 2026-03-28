import LoginClient from "./login-client";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const verify = params.verify;
  const verifyNotice = Array.isArray(verify) ? verify.includes("1") : verify === "1";

  return <LoginClient verifyNotice={verifyNotice} />;
}
