# Voice Studio — Legacy Audio Capture Facade

Esta etapa cria uma fachada compatível com o formato esperado pelo controlador legado.

Ela preserva:

- seleção do microfone por `deviceId`;
- monitoramento opcional;
- meter e peak contínuos;
- acesso ao recorder e stream;
- stop, cancel e dispose.

A fachada não cria `MediaRecorder` nem chama `getUserMedia` diretamente. Essas responsabilidades permanecem concentradas nos adapters de browser extraídos anteriormente.

O controlador ainda não foi alterado nesta etapa. A próxima PR deve substituir suas refs e funções nativas por uma única referência para esta fachada.
