export function videoEmbed(url){
  if(!url) return '';
  if(url.includes('youtube.com')||url.includes('youtu.be')){
    const id = url.split('v=')[1]?.split('&')[0] || url.split('/').pop();
    return `<iframe width="100%" height="220" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe>`;
  }
  return `<video src="${url}" controls style="width:100%;max-height:240px"></video>`;
}