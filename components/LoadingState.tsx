export default function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-10 h-10 border-4 border-zinc-200 border-t-black rounded-full animate-spin" />
      <p className="text-sm text-zinc-500 font-medium">Analizando factura...</p>
    </div>
  );
}
