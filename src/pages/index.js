// Local demo entry point: the API-only backend has no UI of its own.
// Sends the browser to the integrated dashboard under public/app.
export default function Home() {
  return null;
}

export async function getServerSideProps() {
  return { redirect: { destination: '/app/index.html', permanent: false } };
}
