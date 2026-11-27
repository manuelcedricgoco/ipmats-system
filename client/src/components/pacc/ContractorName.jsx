/** A case's contractor. The name is kept on the case, so it still shows after an Admin deletes the contractor. */
export default function ContractorName({ name, removed }) {
  return (
    <>
      {name}
      {removed && <span className="ml-1 text-xs text-slate-500">(removed from contractor list)</span>}
    </>
  );
}
