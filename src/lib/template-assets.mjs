export async function readTemplateAsset(filename,assets,readLocal){
  if(!/^[\p{L}\p{N}._() -]+$/u.test(filename)||filename.startsWith('.')) throw new Error('Invalid template filename');
  if(!assets) return readLocal(filename);
  const response=await assets.fetch(`https://assets.local/templates/${encodeURIComponent(filename)}`);
  if(!response.ok) throw new Error(`Template asset unavailable (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}
