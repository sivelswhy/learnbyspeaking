#include "ort_shim.h"
#include <onnxruntime/onnxruntime_c_api.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

struct OrtShimSession { OrtSession *session; };

static const OrtApi *api(void) { static const OrtApi *a = NULL; if (!a) a = OrtGetApiBase()->GetApi(ORT_API_VERSION); return a; }
static OrtEnv *env(void) {
    static OrtEnv *e = NULL;
    if (!e) { OrtStatus *st = api()->CreateEnv(ORT_LOGGING_LEVEL_WARNING, "lbs", &e); if (st) { api()->ReleaseStatus(st); e = NULL; } }
    return e;
}

static int fail(OrtStatus *st, char *err) {
    if (!st) return 0;
    if (err) snprintf(err, 512, "%s", api()->GetErrorMessage(st));
    api()->ReleaseStatus(st);
    return 1;
}

/* Copie les sorties (tenseurs float) et les libère. Toute sortie est libérée, même en cas d'erreur. */
static int copy_outputs(OrtValue **res, int nouts, OrtShimOutput *outs, char *err) {
    int ok = 1;
    for (int i = 0; i < nouts; i++) {
        outs[i].data = NULL;
        outs[i].count = 0;
        if (!ok || !res[i]) { if (res[i]) api()->ReleaseValue(res[i]); continue; }
        OrtTensorTypeAndShapeInfo *info = NULL;
        size_t count = 0;
        ONNXTensorElementDataType t = ONNX_TENSOR_ELEMENT_DATA_TYPE_UNDEFINED;
        float *p = NULL;
        if (fail(api()->GetTensorTypeAndShape(res[i], &info), err)) ok = 0;
        else {
            if (fail(api()->GetTensorShapeElementCount(info, &count), err) || fail(api()->GetTensorElementType(info, &t), err)) ok = 0;
            api()->ReleaseTensorTypeAndShapeInfo(info);
        }
        if (ok && t != ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT) { if (err) snprintf(err, 512, "sortie %d : type %d, float attendu", i, (int)t); ok = 0; }
        if (ok && fail(api()->GetTensorMutableData(res[i], (void **)&p), err)) ok = 0;
        if (ok) {
            outs[i].data = malloc(count * sizeof(float) + 1);
            if (!outs[i].data) { if (err) snprintf(err, 512, "mémoire insuffisante"); ok = 0; }
            else { memcpy(outs[i].data, p, count * sizeof(float)); outs[i].count = count; }
        }
        api()->ReleaseValue(res[i]);
    }
    if (!ok) for (int i = 0; i < nouts; i++) { free(outs[i].data); outs[i].data = NULL; outs[i].count = 0; }
    return ok;
}

OrtShimSession *ort_shim_open(const char *path, char *err) {
    OrtSessionOptions *opt = NULL;
    if (fail(api()->CreateSessionOptions(&opt), err)) return NULL;
    /* Réglages facultatifs : un échec garde la valeur par défaut. */
    (void)fail(api()->SetSessionGraphOptimizationLevel(opt, ORT_ENABLE_ALL), NULL);
    (void)fail(api()->SetIntraOpNumThreads(opt, 4), NULL);
    if (!env()) { api()->ReleaseSessionOptions(opt); if (err) snprintf(err, 512, "onnxruntime : environnement non créé"); return NULL; }
    OrtSession *s = NULL;
    OrtStatus *st = api()->CreateSession(env(), path, opt, &s);
    api()->ReleaseSessionOptions(opt);
    if (fail(st, err)) return NULL;
    OrtShimSession *r = malloc(sizeof *r);
    if (!r) { api()->ReleaseSession(s); if (err) snprintf(err, 512, "mémoire insuffisante"); return NULL; }
    r->session = s;
    return r;
}

void ort_shim_close(OrtShimSession *s) { if (!s) return; api()->ReleaseSession(s->session); free(s); }
void ort_shim_free(void *p) { free(p); }

int ort_shim_run(OrtShimSession *s, const char **int_names, const int64_t **int_data, int nints, int64_t n,
                 const char *len_name, int64_t len_value, const char *scale_name, const float *scales, int64_t nscales,
                 const char **out_names, int nouts, OrtShimOutput *outs, char *err) {
    if (nints + 2 > 8 || nouts > 8) { if (err) snprintf(err, 512, "trop d'entrées ou de sorties"); return -1; }
    OrtMemoryInfo *mem = NULL;
    if (fail(api()->CreateCpuMemoryInfo(OrtArenaAllocator, OrtMemTypeDefault, &mem), err)) return -1;
    const char *names[8];
    OrtValue *vals[8] = {0};
    int k = 0, rc = -1;
    int64_t shape[2] = {1, n};
    for (int i = 0; i < nints; i++, k++) {
        names[k] = int_names[i];
        if (fail(api()->CreateTensorWithDataAsOrtValue(mem, (void *)int_data[i], (size_t)n * sizeof(int64_t), shape, 2, ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64, &vals[k]), err)) goto done;
    }
    int64_t one = 1, lenv = len_value;
    if (len_name) {
        names[k] = len_name;
        if (fail(api()->CreateTensorWithDataAsOrtValue(mem, &lenv, sizeof(int64_t), &one, 1, ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64, &vals[k]), err)) goto done;
        k++;
    }
    if (scale_name) {
        names[k] = scale_name;
        if (fail(api()->CreateTensorWithDataAsOrtValue(mem, (void *)scales, (size_t)nscales * sizeof(float), &nscales, 1, ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT, &vals[k]), err)) goto done;
        k++;
    }
    OrtValue *res[8] = {0};
    if (fail(api()->Run(s->session, NULL, names, (const OrtValue *const *)vals, k, out_names, nouts, res), err)) goto done;
    if (!copy_outputs(res, nouts, outs, err)) goto done;
    rc = nouts;
done:
    for (int i = 0; i < k; i++) if (vals[i]) api()->ReleaseValue(vals[i]);
    api()->ReleaseMemoryInfo(mem);
    return rc;
}

int ort_shim_run_generic(OrtShimSession *s, const OrtShimInput *ins, int nin, const char **out_names, int nouts, OrtShimOutput *outs, char *err) {
    enum { MAXIN = 64, MAXOUT = 8 };
    if (nin > MAXIN || nouts > MAXOUT) { if (err) snprintf(err, 512, "trop d'entrées ou de sorties"); return -1; }
    OrtMemoryInfo *mem = NULL;
    if (fail(api()->CreateCpuMemoryInfo(OrtArenaAllocator, OrtMemTypeDefault, &mem), err)) return -1;
    const char *names[MAXIN];
    OrtValue *vals[MAXIN] = {0};
    OrtValue *res[MAXOUT] = {0};
    static char dummy[8];
    int rc = -1;
    for (int i = 0; i < nin; i++) {
        size_t n = 1;
        for (int d = 0; d < ins[i].ndim; d++) n *= (size_t)ins[i].shape[d];
        size_t isz = ins[i].dtype == 0 ? 8 : ins[i].dtype == 1 ? 4 : 1;
        ONNXTensorElementDataType t = ins[i].dtype == 0 ? ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64 : ins[i].dtype == 1 ? ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT : ONNX_TENSOR_ELEMENT_DATA_TYPE_BOOL;
        names[i] = ins[i].name;
        void *p = (n == 0 || !ins[i].data) ? (void *)dummy : (void *)ins[i].data;
        if (fail(api()->CreateTensorWithDataAsOrtValue(mem, p, n * isz, ins[i].shape, (size_t)ins[i].ndim, t, &vals[i]), err)) goto done;
    }
    if (fail(api()->Run(s->session, NULL, names, (const OrtValue *const *)vals, (size_t)nin, out_names, (size_t)nouts, res), err)) goto done;
    if (!copy_outputs(res, nouts, outs, err)) goto done;
    rc = nouts;
done:
    for (int i = 0; i < nin; i++) if (vals[i]) api()->ReleaseValue(vals[i]);
    api()->ReleaseMemoryInfo(mem);
    return rc;
}
