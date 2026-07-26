'use strict';

function createBootstrapCredential(value) {
  let credential = value || null;
  const bootstrapCredentialPresentAtStartup = Boolean(credential);
  const diagnostics = {
    bootstrapCredentialPresentAtStartup,
    bootstrapCredentialConsumeRequested: false,
    bootstrapCredentialPresentAtConsume: false,
    bootstrapCredentialConsumed: false
  };

  function consume(senderValid) {
    const valid = senderValid === true;
    const bootstrapCredentialPresentAtConsume = Boolean(credential);
    const bootstrapCredentialConsumed = valid && bootstrapCredentialPresentAtConsume;
    Object.assign(diagnostics, {
      bootstrapCredentialConsumeRequested: true,
      bootstrapCredentialPresentAtConsume,
      bootstrapCredentialConsumed
    });
    if (!valid) return { token: null, senderValid: false, ...diagnostics };
    const token = credential;
    credential = null;
    return { token, senderValid: true, ...diagnostics };
  }

  return {
    bootstrapCredentialPresentAtStartup,
    consume,
    diagnostics: () => ({ ...diagnostics }),
    clear: () => { credential = null; }
  };
}

module.exports = { createBootstrapCredential };
