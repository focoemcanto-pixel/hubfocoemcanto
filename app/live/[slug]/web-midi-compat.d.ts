interface ArrayConstructor {
  from(
    arrayLike: Iterable<MIDIInput>,
  ): Array<{
    id: string;
    name?: string;
    onmidimessage: ((event: { data: Uint8Array | number[] }) => void) | null;
  }>;
}
