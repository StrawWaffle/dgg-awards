import { Credits } from "@/data";

export function Acknowledgments() {
  return (
    <div className="space-y-2">
      <p className="text-orange-1 text-lg">Acknowledgments</p>
      {Credits.map((acknowledgment) => (
        <p
          key={`acknowledgment:${acknowledgment.user}`}
          className="m-0 text-xs font-bold"
        >
          {acknowledgment.user}:{" "}
          <span className="text-white-1/50">{acknowledgment.description}</span>
        </p>
      ))}
    </div>
  );
}
