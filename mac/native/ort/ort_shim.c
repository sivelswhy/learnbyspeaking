#include "ort_shim.h"
#include <onnxruntime/onnxruntime_c_api.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

struct OrtShimSession { OrtSession *session; };

static const OrtApi *api(void) { static const OrtApi *a = NULL; if (!a) a = OrtGetApiBase()->GetApi(ORT_API_VERSION); return a; }
static OrtEnv *env(void) { static OrtEnv *e = NULL; if (!e) api()->CreateEnv(ORT_LOGGING_LEVEL_WARNING, "lbs", &e); return e; }

static int fail(OrtStatus *st, char *err) {
    if (!st) return 0;
    if (err) snprintf(err, 512, "%s", api()->GetErrorMessage(st));
    api()->ReleaseStatus(st);
    return 1;
}

OrtShimSession *ort_shim_open(const char *path, char *err) {
    OrtSessionOptions *opt = NULL;
    if (fail(api()->CreateSessionOptions(&opt), err)) return NULL;
    api()->SetSessionGraphOptimizationLevel(opt, ORT_ENABLE_ALL);
    api()->SetIntraOpNumThreads(opt, 4);
    OrtSession *s = NULL;
    OrtStatus *st = api()->CreateSession(env(), path, opt, &s);
    api()->ReleaseSessionOptions(opt);
    if (fail(st, err)) return NULL;
    OrtShimSession *r = malloc(sizeof *r);
    r->session = s;
    return r;
}

void ort_shim_close(OrtShimSession *s) { if (!s) return; api()->ReleaseSession(s->session); free(s); }
void ort_shim_free(void *p) { free(p); }

int ort_shim_run(OrtShimSession *s, const char **int_names, const int64_t **int_data, int nints, int64_t n,
                 const char *len_name, int64_t len_value, const char *scale_name, const float *scales, int64_t nscales,
                 const char **out_names, int nouts, OrtShimOutput *outs, char *err) {
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
    for (int i = 0; i < nouts; i++) {
        OrtTensorTypeAndShapeInfo *info = NULL;
        size_t count = 0;
        float *p = NULL;
        api()->GetTensorTypeAndShape(res[i], &info);
        api()->GetTensorShapeElementCount(info, &count);
        api()->ReleaseTensorTypeAndShapeInfo(info);
        api()->GetTensorMutableData(res[i], (void **)&p);
        outs[i].data = malloc(count * sizeof(float));
        memcpy(outs[i].data, p, count * sizeof(float));
        outs[i].count = count;
        api()->ReleaseValue(res[i]);
    }
    rc = nouts;
done:
    for (int i = 0; i < k; i++) if (vals[i]) api()->ReleaseValue(vals[i]);
    api()->ReleaseMemoryInfo(mem);
    return rc;
}
