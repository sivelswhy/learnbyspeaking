// Couche C minimale au-dessus de l'API d'onnxruntime, appelée depuis Swift (voix Piper, vocalisation Phonikud).
#include <stdint.h>
#include <stddef.h>

typedef struct OrtShimSession OrtShimSession;

/// Charge un modèle ONNX ; NULL en cas d'échec (message dans err, 512 octets).
OrtShimSession *ort_shim_open(const char *path, char *err);
void ort_shim_close(OrtShimSession *s);

/// Entrées int64 [1, n] (nb entrées nints) + facultatif : un tenseur int64 [1] (lengths) et un float32 [nscales].
/// Sorties : copiées dans des tampons alloués par malloc (à libérer avec ort_shim_free) ; renvoie le nombre de sorties.
typedef struct { float *data; size_t count; } OrtShimOutput;

int ort_shim_run(OrtShimSession *s,
                 const char **int_names, const int64_t **int_data, int nints, int64_t n,
                 const char *len_name, int64_t len_value,
                 const char *scale_name, const float *scales, int64_t nscales,
                 const char **out_names, int nouts, OrtShimOutput *outs, char *err);
void ort_shim_free(void *p);
