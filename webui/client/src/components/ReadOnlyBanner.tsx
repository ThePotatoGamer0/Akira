export function ReadOnlyBanner(props: { onPoke: () => void; message?: string }) {
  return (
    <div className="read-only-banner" role="status">
      <p>
        {props.message ??
          "Akira is napping. You can look around. She won't remember any new moves until she's back."}
      </p>
      <button type="button" onClick={props.onPoke}>
        Poke her
      </button>
    </div>
  );
}
