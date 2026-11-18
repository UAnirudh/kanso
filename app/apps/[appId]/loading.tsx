export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <div className="flex h-[46px] items-center border-b border-[#16191e] px-3">
        <div className="skeleton h-3 w-24" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[244px] shrink-0 border-r border-[#16191e] p-3 lg:block">
          <div className="skeleton mb-2 h-14 w-full" />
          <div className="skeleton mb-1.5 h-6 w-full" />
          <div className="skeleton mb-1.5 h-6 w-full" />
          <div className="skeleton h-6 w-4/5" />
        </div>
        <div className="min-w-0 flex-1 p-5">
          <div className="skeleton mb-3 h-5 w-40" />
          <div className="rounded-[14px] border border-[#1c1f25] p-4">
            <div className="grid gap-3 lg:grid-cols-12">
              <div className="skeleton h-24 lg:col-span-12" />
              <div className="skeleton h-52 lg:col-span-8" />
              <div className="skeleton h-52 lg:col-span-4" />
            </div>
          </div>
        </div>
        <div className="hidden w-[350px] shrink-0 border-l border-[#16191e] p-3 lg:block">
          <div className="skeleton mb-2 h-4 w-32" />
          <div className="skeleton h-24 w-full" />
        </div>
      </div>
      <span className="sr-only">Loading your interface…</span>
    </div>
  );
}
