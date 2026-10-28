const MAX_CHUNK = 65536;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const only = (value, keys) => Object.keys(value).every(key => keys.includes(key));
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const timestamp = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function validateOperation(op) {
    if (!isObject(op) || !only(op,['protocol','opId','clientId','docId','base','note']) || op.protocol !== 1 ||
        !id(op.opId) || !id(op.clientId) || !id(op.docId)) return false;
    if (op.base !== null && (!isObject(op.base) || !only(op.base,['epoch','sequence']) || !id(op.base.epoch) ||
        !Number.isSafeInteger(op.base.sequence) || op.base.sequence < 1)) return false;
    const note = op.note;
    if (!isObject(note) || !only(note,['id','html','auto','updated','state','received','deleted']) || note.id !== op.docId ||
        !['active','trash','removed'].includes(note.state) || !timestamp(note.updated) || typeof note.received !== 'boolean') return false;
    if (note.state !== 'removed' && (typeof note.html !== 'string' || typeof note.auto !== 'string')) return false;
    if (note.state === 'trash' && !timestamp(note.deleted)) return false;
    return true;
}

export function splitMessage(value) {
    const encoded = new TextEncoder().encode(JSON.stringify(value));
    const total = Math.max(1,Math.ceil(encoded.length / MAX_CHUNK));
    return Array.from({length:total},(_,index)=>({index,total,bytes:Array.from(encoded.subarray(index*MAX_CHUNK,(index+1)*MAX_CHUNK))}));
}

export function joinMessage(chunks) {
    if (!Array.isArray(chunks) || !chunks.length) throw new Error('Faltan fragmentos');
    const total=chunks.length;
    let length=0;
    for (const [index,chunk] of chunks.entries()) {
        if (!isObject(chunk) || chunk.index !== index || chunk.total !== total || !Array.isArray(chunk.bytes) ||
            !chunk.bytes.length || chunk.bytes.length > MAX_CHUNK ||
            (index < total-1 && chunk.bytes.length !== MAX_CHUNK) ||
            chunk.bytes.some(byte=>!Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('Fragmento inválido');
        length+=chunk.bytes.length;
    }
    const bytes=new Uint8Array(length);
    let offset=0;
    for (const chunk of chunks) { bytes.set(chunk.bytes,offset);offset+=chunk.bytes.length; }
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
