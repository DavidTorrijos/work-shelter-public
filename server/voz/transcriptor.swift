// Transcriptor de voz del intercomunicador: el dictado del propio macOS (SpeechAnalyzer + SpeechTranscriber, macOS 26),
// que funciona en el equipo, sin red ni cuentas ni coste. Lo compila y lanza server/voz.ts, uno por cada dictado.
//   transcriptor <idioma>        p. ej. es-ES
// Entrada: audio PCM de 16 bits con signo, mono, 16 kHz, por stdin; al cerrarse stdin, termina de transcribir.
// Salida: una línea JSON por evento en stdout:
//   {"t":"listo"}                       ya escucha (la primera vez puede tardar: baja el modelo del idioma)
//   {"t":"descargando"}                 bajando el modelo del idioma (solo la primera vez)
//   {"t":"parcial","texto":"…"}         lo transcrito hasta ahora (lo último aún puede cambiar)
//   {"t":"final","texto":"…"}           el texto definitivo, al terminar
//   {"t":"error","texto":"…"}
import Foundation
import Speech
import AVFoundation

setvbuf(stdout, nil, _IOLBF, 0)
let salida = FileHandle.standardOutput
func emitir(_ t: String, _ texto: String? = nil) {
  var d: [String: String] = ["t": t]
  if let texto { d["texto"] = texto }
  if let j = try? JSONSerialization.data(withJSONObject: d), var linea = String(data: j, encoding: .utf8) {
    linea += "\n"
    salida.write(linea.data(using: .utf8)!)
  }
}

let FORMATO_ENTRADA = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!

@available(macOS 26.0, *)
func transcribir(idioma: String) async throws {
  guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: idioma)) else {
    emitir("error", "El dictado de macOS no admite el idioma \(idioma).")
    return
  }
  let transcriptor = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults, .fastResults], attributeOptions: [])
  if let peticion = try await AssetInventory.assetInstallationRequest(supporting: [transcriptor]) {
    emitir("descargando")
    try await peticion.downloadAndInstall()
  }
  let analizador = SpeechAnalyzer(modules: [transcriptor])
  guard let formato = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriptor]) else {
    emitir("error", "No hay formato de audio para el dictado.")
    return
  }
  let conversor = formato == FORMATO_ENTRADA ? nil : AVAudioConverter(from: FORMATO_ENTRADA, to: formato)
  let (entradas, continuacion) = AsyncStream<AnalyzerInput>.makeStream()

  // resultados: los definitivos se acumulan; el provisional (el final de la frase en curso) se va reemplazando
  let lector = Task {
    var hecho = AttributedString(), provisional = AttributedString()
    for try await r in transcriptor.results {
      if r.isFinal { hecho += r.text; provisional = AttributedString() } else { provisional = r.text }
      emitir("parcial", String((hecho + provisional).characters))
    }
    return String(hecho.characters)
  }
  // con el modelo ya cargado, lo primero que se dice sale enseguida
  try await analizador.prepareToAnalyze(in: formato)
  try await analizador.start(inputSequence: entradas)
  emitir("listo")

  // stdin en trozos: cada uno, a un búfer (convertido al formato del analizador si hace falta)
  let entrada = FileHandle.standardInput
  var resto = Data()
  while true {
    let trozo = entrada.availableData
    if trozo.isEmpty { break }
    resto.append(trozo)
    let muestras = resto.count / 2
    if muestras < 1600 { continue }   // 0,1 s
    let bytes = muestras * 2
    let b = AVAudioPCMBuffer(pcmFormat: FORMATO_ENTRADA, frameCapacity: AVAudioFrameCount(muestras))!
    b.frameLength = AVAudioFrameCount(muestras)
    _ = resto.withUnsafeBytes { p in memcpy(b.int16ChannelData![0], p.baseAddress!, bytes) }
    resto.removeFirst(bytes)
    if let conversor {
      let capacidad = AVAudioFrameCount(Double(muestras) * formato.sampleRate / 16000) + 64
      let out = AVAudioPCMBuffer(pcmFormat: formato, frameCapacity: capacidad)!
      var dado = false
      var err: NSError?
      conversor.convert(to: out, error: &err) { _, estado in
        if dado { estado.pointee = .noDataNow; return nil }
        dado = true; estado.pointee = .haveData; return b
      }
      if let err { emitir("error", err.localizedDescription); break }
      continuacion.yield(AnalyzerInput(buffer: out))
    } else {
      continuacion.yield(AnalyzerInput(buffer: b))
    }
  }
  continuacion.finish()
  try await analizador.finalizeAndFinishThroughEndOfInput()
  let texto = try await lector.value
  emitir("final", texto.trimmingCharacters(in: .whitespacesAndNewlines))
}

let idioma = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : Locale.current.identifier
if #available(macOS 26.0, *) {
  let hecho = DispatchSemaphore(value: 0)
  Task {
    do { try await transcribir(idioma: idioma) } catch { emitir("error", error.localizedDescription) }
    hecho.signal()
  }
  hecho.wait()
} else {
  emitir("error", "El dictado del intercomunicador necesita macOS 26 o posterior.")
}
