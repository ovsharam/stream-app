/** Injected into workspace webviews — hide scrollbars while keeping scroll. */
export const WEBVIEW_HIDE_SCROLLBAR_JS = `(function(){
  var id='notch-hide-scrollbar';
  if(document.getElementById(id))return;
  var s=document.createElement('style');
  s.id=id;
  s.textContent='html,body,*{scrollbar-width:none!important;-ms-overflow-style:none!important}*::-webkit-scrollbar,html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important;width:0!important;height:0!important;background:transparent!important}';
  (document.head||document.documentElement).appendChild(s);
})();`
