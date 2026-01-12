# README

### Prerequisites:

Ensure/Set `pulse-energy` project is active for gcloud CLI.
Run:

```bash
$ gcloud config set project pulse-energy
```

Ensure/Set the associated cluster in which you want to make changes.
Run:

```bash
$ kubectl config use-context gke_PROJECT_REGION_CLUSTER-NAME
$ kubectl config use-context gke_pulse-energy_asia-south1_pulse-energy-prod-cluster
$ kubectl config use-context gke_pulse-energy_asia-south1_stg-pulse-energy-cluster
```

### To change a secret:

1. `cd` into the `staging/ops-dashboard-api` or `env/your_workload_name`
2. Run `sops secret.enc.yaml`. It will open the VIM editor, add/update the variables and save.
3. Run `kustomize build --enable-alpha-plugins . | kubectl apply -f -`

### To deploy a new build:

1. Build image in Cloud-build/ triggers
2. Once built, copy the commit hash.
3. Paste the hash into the correct deployment-patch.yaml file for the work-load to be deployed, at the end of the line templates / spec / containers / image
4. `cd` into the `k8s/environments/<production or staging>/<the work-load to be deployed>`
5. Check k8s VSCode has the correct cluster selected
6. Run `./../../../apply_k8s_config.sh`
7. Check it's deployed by going to the workload, in Active revisions section, Summary column - should include the image with the commit hash from above.

### Generating encrypted secrets (if you already have decrypted ones)

- Run `sops -e secret.dec.yaml > secret.enc.yaml`



## OCPP Deployments

### Making nginx build images


##### pulse-central-ocpp-nginx-blue
```
bash 
$ docker buildx build \
    -f Dockerfile.ocpp.nginx \
    -t asia-south1-docker.pkg.dev/pulse-energy/pulse-central-ocpp-nginx/pulse-central-ocpp-nginx-blue:v2.6.0 \
    --platform linux/amd64 \
    --build-arg PHASE=blue \
    --build-arg CUSTOMER=pulse \
    --push .
```

##### pulse-central-ocpp-nginx-green
```
bash 
$ docker buildx build \
    -f Dockerfile.ocpp.nginx \
    -t asia-south1-docker.pkg.dev/pulse-energy/pulse-central-ocpp-nginx/pulse-central-ocpp-nginx-green:v2.6.0 \
    --platform linux/amd64 \
    --build-arg PHASE=green \
    --build-arg CUSTOMER=pulse \
    --push .
```

##### thunderplus-central-ocpp-nginx-blue
```
bash 
$ docker buildx build \
    -f Dockerfile.ocpp.nginx \
    -t asia-south1-docker.pkg.dev/pulse-energy/pulse-central-ocpp-nginx/thunderplus-central-ocpp-nginx-blue:v2.6.0 \
    --platform linux/amd64 \
    --build-arg PHASE=blue \
    --build-arg CUSTOMER=thunderplus \
    --push .
```

##### thunderplus-central-ocpp-nginx-green
```
bash 
$ docker buildx build \
    -f Dockerfile.ocpp.nginx \
    -t asia-south1-docker.pkg.dev/pulse-energy/pulse-central-ocpp-nginx/thunderplus-central-ocpp-nginx-green:v2.6.0 \
    --platform linux/amd64 \
    --build-arg PHASE=green \
    --build-arg CUSTOMER=thunderplus \
    --push .
```



### Making typesense build images

docker buildx build \
    -f Dockerfile.typesense \
    -t asia-south1-docker.pkg.dev/pulse-energy/pulse-typesense/pulse-typesense:v1.4 \
    --platform linux/amd64 \
    --push .
