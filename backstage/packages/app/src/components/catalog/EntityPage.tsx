import React from 'react';
import { Button } from '@material-ui/core';
import { useApi } from '@backstage/core-plugin-api';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';

const DeleteServiceButton = ({ serviceName, repoUrl }) => {
  const scaffolderApi = useApi(scaffolderApiRef);

  const handleDelete = async () => {
    try {
      // Call API to delete the service
      await scaffolderApi.deleteService({ serviceName });

      // Call API to delete the repository
      await scaffolderApi.deleteRepository({ repoUrl });

      // Delete local projects
      await scaffolderApi.deleteLocalProjects();

      alert('Service, repository, and local projects deleted successfully!');
    } catch (error) {
      console.error('Failed to delete service, repository, or local projects:', error);
      alert('Failed to delete service, repository, or local projects.');
    }
  };

  return (
    <Button variant="contained" color="secondary" onClick={handleDelete}>
      Delete Service
    </Button>
  );
};

const EntityPage = ({ entity }) => {
  const serviceName = entity.metadata.name;
  const repoUrl = entity.metadata.annotations['backstage.io/source-location'];

  return (
    <div>
      <h1>{entity.metadata.name}</h1>
      <DeleteServiceButton serviceName={serviceName} repoUrl={repoUrl} />
    </div>
  );
};

export default EntityPage;