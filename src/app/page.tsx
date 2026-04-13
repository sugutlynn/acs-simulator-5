import Simulator from '@/components/Simulator';
export default function Home() {
  const hasServerKey = Boolean(process.env.ANTHROPIC_API_KEY);
  return <Simulator hasServerKey={hasServerKey} />;
}
