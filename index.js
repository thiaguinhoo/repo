const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { CookieJar } = require("tough-cookie");
const { HttpsCookieAgent } = require("http-cookie-agent/http");

const jar = new CookieJar();

const instance = axios.create({ jar, withCredentials: true });

const serverPort = process.env.SERVER_PORT || 3333;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.post("/PROD/RetornaInfosEsocial", async (req, res) => {
  const {
    body: { certificate, password, companyCNPJ, employeeCPF },
  } = req.body;

  instance.interceptors.request.use((config) => {
    return Object.assign(config, {
      httpsAgent: new HttpsCookieAgent({
        rejectUnauthorized: false,
        pfx: Buffer.from(certificate, "base64"),
        passphrase: password,
        cookies: { jar },
      }),
      validateStatus: null,
    });
  });

  try {
    let response = await instance.get(
      "https://acesso.gov.br/api/login-openid",
      {
        maxRedirects: 0,
      }
    );

    response = await instance.get(response.headers.location, {
      maxRedirects: 0,
    });

    response = await instance.get(
      response.headers.location?.replace(
        "sso.acesso.gov.br",
        "certificado.sso.acesso.gov.br"
      ),
      { maxRedirects: 0 }
    );
    response = await instance.get("https://login.esocial.gov.br/login.aspx");

    const match = response.data.match(
      /https?:\/\/sso\.acesso\.gov\.br\/authorize[^'"]*/
    );

    const url = match[0];

    response = await instance.get(url, { maxRedirects: 0 });

    response = await instance.get(response.headers.location, {
      maxRedirects: 0,
    });

    response = await instance.get(response.headers.location, {
      maxRedirects: 0,
    });

    response = await instance.get(
      `https://esocial.gov.br${response.headers.location}`,
      { maxRedirects: 0 }
    );

    const formData = new FormData();

    formData.append("perfil", 2);
    formData.append("trocarPerfil", true);
    formData.append("podeSerMicroPequenaEmpresa", false);
    formData.append("tipoInscricao", 1);
    formData.append("EhOrgaoPublico", false);
    formData.append("logadoComCertificadoDigital", true);
    formData.append("permitirRepresentanteLegal", false);
    formData.append("perfilAcesso", "PROCURADOR_PJ");
    formData.append("procuradorCnpj", companyCNPJ);

    response = await instance.post(
      `https://www.esocial.gov.br/portal/Home/IndexProcuracao?procuradorCnpj${companyCNPJ}=&procuradorCpf=&tipoEmpregador=sst`,
      formData,
      { maxRedirects: 0 }
    );

    response = await instance.post(
      response.headers.location?.replace(
        "/sst/login/",
        "/api/login?identificadorLogin="
      ),
      {}
    );

    response = await instance.get(
      `https://frontend.esocial.gov.br/api/gestaoTrabalhadores/listarTrabalhadoresAutocompleteCpfCompleto/false/104/true/${employeeCPF}`
    );

    const valor = response.data.conteudo[0].valor;
    const urlPesquisaTrabalhador =
      "https://frontend.esocial.gov.br/api/gestaoTrabalhadores/pesquisarTrabalhador/" +
      valor +
      "/false/true";

    response = await instance.get(urlPesquisaTrabalhador);

    res.json(response.data.conteudo);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(serverPort, () => console.log(`Server running on *:${serverPort}`));
